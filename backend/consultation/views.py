from __future__ import annotations

import logging
from typing import Optional

from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.db.models import Count, Max, Q, Prefetch
from django.http import Http404, HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError as DRFValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.utils import timezone
from django.utils.dateparse import parse_date
from laboratory.pagination import LabCatalogPagination

logger = logging.getLogger(__name__)

from .models import (
    ConsultationRoom,
    ConsultationRoomOccupancy,
    ConsultationSession,
    ConsultationQueue,
    consultation_queue_priority_for_visit,
    Referral,
    ReferralFacility,
    ResponsibilityFormIssuance,
    Diagnosis,
    ICD10Code,
    PresentingComplaintCategory,
    PresentingComplaint,
)
from .serializers import (
    ConsultationRoomSerializer,
    ConsultationSessionSerializer,
    ConsultationQueueSerializer,
    ConsultationQueueByVisitSerializer,
    ConsultationSessionByVisitSerializer,
    ReferralSerializer,
    ReferralFacilitySerializer,
    ResponsibilityFormIssuanceSerializer,
    DiagnosisSerializer,
    DiagnosisCorrectionSerializer,
    ICD10CodeSerializer,
    PresentingComplaintCategorySerializer,
    PresentingComplaintSerializer,
)
from audit.services import AuditService
from patients.workflow import close_visit_workflow, finalize_consultation_artifacts_for_visit
from patients.nursing_leg_status import (
    apply_visit_completion_after_leg,
    mark_consultation_session_clinic_completed,
    visit_should_close_after_clinic_completion,
)
from common.mixins import ClinicScopedMixin
from common.openapi import REFERRAL_FORM_PK_PARAMS, document_viewset
from accounts.utils import resolve_clinic_id
from organization.models import SystemConfig
from .room_presence import (
    assert_room_accepting_patients,
    checkout_other_rooms_for_doctor,
    get_active_occupancy,
    get_active_occupancies,
    get_doctor_occupancy,
    room_has_capacity,
    presence_override_audit_suffix,
    touch_occupancy,
    user_can_override_room_presence,
)
from .queue_claim import (
    assert_doctor_checked_into_room,
    assert_patient_not_in_other_doctors_session,
    claim_queue_for_session,
)
from .room_queue_stats import build_room_queue_stats
from .queue_notifications import notify_doctor_in_room

DIAGNOSIS_REVIEW_PAGE = "/medical-records/diagnosis-review"


def user_can_correct_diagnoses(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    from permissions.page_paths import user_has_exact_page
    from permissions.user_pages import get_user_allowed_pages

    return user_has_exact_page(get_user_allowed_pages(user), DIAGNOSIS_REVIEW_PAGE)


@document_viewset(tag="Consultation", resource="referral facilities")
class ReferralFacilityViewSet(viewsets.ModelViewSet):
    """CRUD for the referral-facility catalog (typeahead + Django admin)."""
    serializer_class = ReferralFacilitySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active", "facility_type"]
    search_fields = ["name", "code", "email", "address", "specialties"]
    ordering_fields = ["sort_order", "name", "created_at"]
    ordering = ["sort_order", "name"]
    # Small catalog: return a plain JSON array (avoids pagination quirks).
    pagination_class = None

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ReferralFacility.objects.none()
        
        return ReferralFacility.objects.all()


@document_viewset(tag="Consultation", resource="consultation rooms")
class ConsultationRoomViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing consultation rooms."""
    
    clinic_filter_field = 'clinic'
    serializer_class = ConsultationRoomSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'specialty', 'is_active', 'clinic', 'room_type']
    search_fields = ['name', 'room_number', 'location']
    ordering_fields = ['room_number', 'name']
    ordering = ['room_number']
    
    def get_queryset(self):
        # Admin listing must include inactive / maintenance rows so filters work.
        # Use ``is_active`` / ``status`` query params to narrow results.
        if getattr(self, 'swagger_fake_view', False):
            return ConsultationRoom.objects.none()

        active_occupancy_qs = ConsultationRoomOccupancy.objects.filter(
            is_active=True,
        ).select_related('doctor')
        active_session_qs = ConsultationSession.objects.filter(
            status='active',
        ).select_related('patient', 'doctor')
        
        return self.scope_queryset(
            ConsultationRoom.objects.all()
            .select_related('clinic')
            .prefetch_related(
                Prefetch(
                    'occupancies',
                    queryset=active_occupancy_qs,
                    to_attr='_active_occupancies',
                ),
                Prefetch(
                    'sessions',
                    queryset=active_session_qs,
                    to_attr='_active_sessions',
                ),
            )
        )
    
    @extend_schema(tags=["Consultation"], summary="Queue", description="Get queue for a room.")
    @action(detail=True, methods=['get'])
    def queue(self, request, pk=None):
        """Get queue for a room."""
        room = self.get_object()
        queue_items = (
            room.queue_items.filter(is_active=True)
            .select_related('room', 'patient', 'visit')
            .prefetch_related('visit__vital_readings')
            .order_by('priority', 'queued_at')
        )
        serializer = ConsultationQueueSerializer(queue_items, many=True)
        return Response(serializer.data)

    @extend_schema(tags=["Consultation"], summary="List stats", description="Tab counts for admin rooms list (replaces 4 parallel COUNT requests).")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Tab counts for admin rooms list (replaces 4 parallel COUNT requests)."""
        from common.list_stats import aggregate_status_counts, viewset_queryset_excluding_params

        qs = viewset_queryset_excluding_params(self, frozenset({'status', 'page', 'page_size', 'ordering'}))
        data = aggregate_status_counts(
            qs,
            'status',
            {
                'active': 'active',
                'inactive': 'inactive',
                'maintenance': 'maintenance',
            },
        )
        return Response(data)

    def _serialize_room(self, room):
        return ConsultationRoomSerializer(room, context=self.get_serializer_context()).data

    @extend_schema(tags=["Consultation"], summary="Queue stats", description="Per-room sent/waiting/in-consult/completed counts for a day.")
    @action(detail=False, methods=['get'], url_path='queue-stats')
    def queue_stats(self, request):
        day = parse_date(request.query_params.get('date') or '') or timezone.localdate()
        room_ids = list(
            self.scope_queryset(ConsultationRoom.objects.all()).values_list('id', flat=True)
        )
        return Response({'stats': build_room_queue_stats(room_ids, day=day)})

    @extend_schema(tags=["Consultation"], summary="Check in to room")
    @action(detail=True, methods=['post'], url_path='check-in')
    def check_in(self, request, pk=None):
        """Doctor checks into a consultation room (on seat, accepting patients)."""
        room = self.get_object()
        user = request.user

        with transaction.atomic():
            checkout_other_rooms_for_doctor(user, exclude_room_id=room.id)
            existing = get_doctor_occupancy(room, user)

            if existing:
                existing.status = ConsultationRoomOccupancy.STATUS_ON_SEAT
                touch_occupancy(existing)
                existing.save(update_fields=['status'])
            else:
                if not room_has_capacity(room):
                    occupancies = get_active_occupancies(room)
                    names = ', '.join(o.doctor.get_full_name() for o in occupancies[:3])
                    return Response(
                        {
                            'detail': (
                                f'{room.name} is at capacity ({room.capacity}). '
                                f'Currently in room: {names}.'
                            ),
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                ConsultationRoomOccupancy.objects.create(
                    room=room,
                    doctor=user,
                    status=ConsultationRoomOccupancy.STATUS_ON_SEAT,
                    is_active=True,
                )

        room = self.get_queryset().get(pk=room.pk)
        return Response(self._serialize_room(room))

    @extend_schema(tags=["Consultation"], summary="Check out of room")
    @action(detail=True, methods=['post'], url_path='check-out')
    def check_out(self, request, pk=None):
        """Doctor leaves the consultation room."""
        room = self.get_object()
        user = request.user
        occupancy = get_doctor_occupancy(room, user)

        if occupancy is None:
            return Response(self._serialize_room(room))

        if occupancy.doctor_id != user.id and not user_can_override_room_presence(user):
            return Response(
                {'detail': 'Only the doctor in this room can check out.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        has_active_session = ConsultationSession.objects.filter(
            room=room,
            doctor=user,
            status='active',
        ).exists()
        if has_active_session:
            return Response(
                {'detail': 'End your active consultation before checking out of the room.'},
                status=status.HTTP_409_CONFLICT,
            )

        now = timezone.now()
        occupancy.is_active = False
        occupancy.status = ConsultationRoomOccupancy.STATUS_AWAY
        occupancy.checked_out_at = now
        occupancy.last_seen_at = now
        occupancy.save(
            update_fields=['is_active', 'status', 'checked_out_at', 'last_seen_at'],
        )

        room = self.get_queryset().get(pk=room.pk)
        return Response(self._serialize_room(room))

    @extend_schema(tags=["Consultation"], summary="Set accepting patients")
    @action(detail=True, methods=['post'], url_path='set-accepting')
    def set_accepting(self, request, pk=None):
        """Toggle whether the doctor in the room accepts new patients."""
        room = self.get_object()
        user = request.user
        occupancy = get_doctor_occupancy(room, user)

        if occupancy is None:
            return Response(
                {'detail': 'You must be checked into this room to change availability.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        accepting = request.data.get('accepting')
        if accepting is None:
            return Response(
                {'detail': 'accepting (boolean) is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        occupancy.status = (
            ConsultationRoomOccupancy.STATUS_ON_SEAT
            if bool(accepting)
            else ConsultationRoomOccupancy.STATUS_NOT_ACCEPTING
        )
        touch_occupancy(occupancy)
        occupancy.save(update_fields=['status'])

        room = self.get_queryset().get(pk=room.pk)
        return Response(self._serialize_room(room))

    @extend_schema(tags=["Consultation"], summary="Heartbeat while in room")
    @action(detail=True, methods=['post'], url_path='heartbeat')
    def heartbeat(self, request, pk=None):
        """Refresh last-seen timestamp while the doctor remains in the room."""
        room = self.get_object()
        user = request.user
        occupancy = get_doctor_occupancy(room, user)

        if occupancy is None:
            return Response(
                {'detail': 'You are not checked into this room.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        touch_occupancy(occupancy)
        room = self.get_queryset().get(pk=room.pk)
        return Response(self._serialize_room(room))


@extend_schema_view(
    list=extend_schema(summary="List consultation sessions", tags=["Consultation"]),
    retrieve=extend_schema(summary="Retrieve consultation session", tags=["Consultation"]),
    create=extend_schema(summary="Start consultation session", tags=["Consultation"]),
    update=extend_schema(summary="Update consultation session", tags=["Consultation"]),
    partial_update=extend_schema(summary="Partially update consultation session", tags=["Consultation"]),
    destroy=extend_schema(summary="End or remove consultation session", tags=["Consultation"]),
)
class ConsultationSessionViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing consultation sessions."""
    serializer_class = ConsultationSessionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['room', 'patient', 'doctor', 'status', 'visit']
    search_fields = [
        'session_id',
        'notes',
        'patient__first_name',
        'patient__surname',
        'patient__patient_id',
        'visit__visit_id',
        'doctor__first_name',
        'doctor__last_name',
    ]
    ordering_fields = ['started_at', 'ended_at']
    ordering = ['-started_at']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ConsultationSession.objects.none()
        
        qs = ConsultationSession.objects.all().select_related(
            'room',
            'room__clinic',
            'patient',
            'doctor',
            'visit',
            'visit__location_clinic',
            'location_clinic',
            'created_by',
        )

        # Match VisitViewSet-style date filtering for history views.
        # We filter by started_at because it represents the actual consultation time.
        date = self.request.query_params.get('date')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if date:
            qs = qs.filter(started_at__date=date)
        elif start_date:
            qs = qs.filter(started_at__date__gte=start_date)
            if end_date:
                qs = qs.filter(started_at__date__lte=end_date)
        elif end_date:
            qs = qs.filter(started_at__date__lte=end_date)

        # Clinic filtering (stored on Visit.clinic as a string; see serializer clinic_name source='visit.clinic')
        clinic = self.request.query_params.get('clinic')
        if clinic:
            qs = qs.filter(visit__clinic=clinic)

        return self.scope_queryset(qs)

    @extend_schema(tags=["Consultation"], summary="By visits", description="Open consultation sessions for a set of visit IDs.")
    @action(detail=False, methods=['get'], url_path='by-visits')
    def by_visits(self, request):
        """
        Active or paused consultation sessions for a set of visit IDs.
        Used by nursing pool to show in-consult status after queue claim-on-start.
        """
        raw = (request.query_params.get('visit_ids') or '').strip()
        if not raw:
            return Response({'results': []})
        ids = []
        for part in raw.split(','):
            part = part.strip()
            if not part:
                continue
            try:
                vid = int(part)
                if vid > 0:
                    ids.append(vid)
            except ValueError:
                continue
        if not ids:
            return Response({'results': []})
        qs = self.scope_queryset(
            self.get_queryset().filter(
                visit_id__in=ids,
                status__in=['active', 'paused'],
            )
        )
        return Response({'results': ConsultationSessionByVisitSerializer(qs, many=True).data})

    def create(self, request, *args, **kwargs):
        """
        Start a consultation session.

        Starting can be retried from the frontend or repeated for a patient that
        already has an active session. Treat those cases as resume requests
        instead of surfacing database uniqueness errors as production 500s.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        paused_block = self._paused_session_blocks_new_create(data)
        if paused_block is not None:
            return paused_block

        existing_session = self._find_existing_active_session(data)
        if existing_session:
            doctor = data.get('doctor') or self._find_doctor_for_session(data)
            if (
                doctor
                and existing_session.doctor_id
                and existing_session.doctor_id != getattr(doctor, 'pk', doctor)
            ):
                other_name = (
                    existing_session.doctor.get_full_name()
                    if existing_session.doctor
                    else 'another doctor'
                )
                return Response(
                    {
                        'detail': (
                            f'This patient is already in consultation with {other_name} '
                            f'in {existing_session.room.name}.'
                        ),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            existing_session = self._sync_resumed_session_room_to_request(existing_session, data)
            payload = self.get_serializer(existing_session).data
            payload['resumed'] = True
            return Response(payload, status=status.HTTP_200_OK)

        doctor = data.get('doctor') or self._find_doctor_for_session(data)
        save_kwargs = {'created_by': request.user}
        if doctor:
            save_kwargs['doctor'] = doctor

        room = data.get('room')
        patient = data.get('patient')
        if room and patient and doctor:
            try:
                assert_doctor_checked_into_room(room=room, doctor=doctor)
                assert_patient_not_in_other_doctors_session(
                    room=room,
                    patient=patient,
                    doctor=doctor,
                )
            except DRFValidationError as exc:
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

        self.auto_set_clinic(serializer)

        try:
            with transaction.atomic():
                session = serializer.save(**save_kwargs)
                claim_queue_for_session(session)
        except IntegrityError:
            existing_session = self._find_existing_active_session(data)
            if existing_session:
                existing_session = self._sync_resumed_session_room_to_request(existing_session, data)
                payload = self.get_serializer(existing_session).data
                payload['resumed'] = True
                return Response(payload, status=status.HTTP_200_OK)
            logger.exception("Failed to create consultation session")
            return Response(
                {'detail': 'Could not start consultation session. Please refresh and try again.'},
                status=status.HTTP_409_CONFLICT,
            )

        AuditService.log_activity(
            user=request.user,
            action='create',
            object_type='consultation_session',
            object_id=str(session.id),
            module='consultation',
            object_repr=f'Session {session.session_id}',
            description=f'Started consultation session {session.session_id} for patient {session.patient.get_full_name()}',
            new_values={'session_id': session.session_id, 'status': session.status, 'room': str(session.room.id) if session.room else ''},
            request=request,
        )

        headers = self.get_success_headers(serializer.data)
        return Response(self.get_serializer(session).data, status=status.HTTP_201_CREATED, headers=headers)

    def _find_existing_active_session(self, data):
        visit = data.get('visit')
        if visit:
            existing = (
                ConsultationSession.objects
                .filter(visit=visit, status='active')
                .select_related('room', 'patient', 'doctor', 'visit', 'created_by')
                .first()
            )
            if existing:
                return existing

        patient = data.get('patient')
        room = data.get('room')
        if patient and room:
            return (
                ConsultationSession.objects
                .filter(patient=patient, room=room, status='active')
                .select_related('room', 'patient', 'doctor', 'visit', 'created_by')
                .first()
            )
        return None

    def _paused_session_blocks_new_create(self, data) -> Optional[Response]:
        """Block POST /sessions/ while paused rows exist for the same visit or patient+room."""
        visit = data.get('visit')
        patient = data.get('patient')
        room = data.get('room')
        paused_ids: list[int] = []
        if visit:
            paused_ids.extend(
                ConsultationSession.objects.filter(visit=visit, status='paused').values_list('id', flat=True)
            )
        if patient and room:
            qs = ConsultationSession.objects.filter(patient=patient, room=room, status='paused')
            if visit:
                qs = qs.exclude(visit=visit)
            paused_ids.extend(qs.values_list('id', flat=True))
        paused_ids = sorted(set(paused_ids))
        if not paused_ids:
            return None
        return Response(
            {
                'detail': (
                    'Paused consultation session(s) exist for this visit or for this patient in this room. '
                    'Resume or end them before starting a new session.'
                ),
                'paused_session_ids': paused_ids[:50],
            },
            status=status.HTTP_409_CONFLICT,
        )

    def _sync_resumed_session_room_to_request(self, existing_session, data):
        """
        Resume is keyed by visit (or patient+room). The same visit can be opened from
        a different consultation room URL; move the active row to the requested room so
        the client and DB stay consistent with uniq_active_consult_session_per_patient_room.
        """
        new_room = data.get('room')
        if not new_room:
            return existing_session
        target_room_id = getattr(new_room, 'pk', new_room)
        if existing_session.room_id == target_room_id:
            return existing_session
        conflict = (
            ConsultationSession.objects.filter(
                patient_id=existing_session.patient_id,
                room_id=target_room_id,
                status='active',
            )
            .exclude(pk=existing_session.pk)
            .exists()
        )
        if conflict:
            logger.warning(
                'Cannot move resumed consultation session %s to room %s: patient already has another active session there',
                existing_session.pk,
                target_room_id,
            )
            return existing_session
        existing_session.room = new_room
        existing_session.save(update_fields=['room'])
        return existing_session

    def perform_create(self, serializer):
        """Create consultation session and log audit."""
        # Set the doctor field using multiple fallback strategies
        data = serializer.validated_data.copy()
        if 'doctor' not in data or data['doctor'] is None:
            doctor = self._find_doctor_for_session(data)
            if doctor:
                data['doctor'] = doctor

        session = serializer.save(created_by=self.request.user, **data)

    def perform_update(self, serializer):
        """
        Keep Visit workflow state aligned when session status is updated via PATCH/PUT.
        This covers edit-consultation flows that set status=completed without calling /end/.
        """
        session = self.get_object()
        old_status = session.status
        old_ended_at = session.ended_at

        updated = serializer.save()

        if old_status != updated.status and updated.status == "completed":
            vref = updated.visit
            fields_to_update = []
            if not updated.ended_at:
                updated.ended_at = timezone.now()
                fields_to_update.append("ended_at")
            if fields_to_update:
                updated.save(update_fields=fields_to_update)

            # Deactivate active queue row for this patient in this room, matching /end behavior.
            queue_item = ConsultationQueue.objects.filter(
                room=updated.room,
                patient=updated.patient,
                is_active=True,
            ).first()
            if queue_item:
                queue_item.is_active = False
                queue_item.called_at = updated.ended_at
                queue_item.save(update_fields=["is_active", "called_at"])

            if vref:
                old_vs = vref.status
                old_completed = list(vref.completed_clinics or [])
                from consultation.session_completion import finalize_consultation_session_for_visit

                finalize_consultation_session_for_visit(updated, user=self.request.user)
                vref.save(update_fields=['completed_clinics', 'status'])
                if old_vs != vref.status or old_completed != list(vref.completed_clinics or []):
                    AuditService.log_activity(
                        user=self.request.user,
                        action="update",
                        object_type="visit",
                        object_id=str(vref.id),
                        module="consultation",
                        object_repr=f"Visit {vref.visit_id}",
                        description=f"Updated visit {vref.visit_id} after consultation session PATCH completed",
                        old_values={"status": old_vs, "completed_clinics": old_completed},
                        new_values={
                            "status": vref.status,
                            "completed_clinics": vref.completed_clinics,
                        },
                        request=self.request,
                    )

            AuditService.log_activity(
                user=self.request.user,
                action="update",
                object_type="consultation_session",
                object_id=str(updated.id),
                module="consultation",
                object_repr=f"Session {updated.session_id}",
                description=f"Updated consultation session {updated.session_id} status to completed",
                old_values={"status": old_status, "ended_at": str(old_ended_at) if old_ended_at else None},
                new_values={"status": "completed", "ended_at": str(updated.ended_at) if updated.ended_at else None},
                request=self.request,
            )

            if vref and vref.status == "completed":
                fin = finalize_consultation_artifacts_for_visit(vref, session_terminal_status="completed")
                if fin["sessions_updated"] or fin["queue_items_deactivated"]:
                    AuditService.log_activity(
                        user=self.request.user,
                        action="update",
                        object_type="visit",
                        object_id=str(vref.id),
                        module="consultation",
                        object_repr=f"Visit {vref.visit_id}",
                        description=(
                            "Synced other open consultation sessions/queue after session PATCH completed: "
                            f"{fin}"
                        ),
                        old_values={"status": "completed"},
                        new_values=fin,
                        request=self.request,
                    )

    def _find_doctor_for_session(self, data):
        """Find appropriate doctor for consultation session using multiple strategies."""
        from accounts.models import User

        user = self.request.user

        # Strategy 1: ALWAYS use the requesting user who performed the action
        # This ensures the actual person who conducted the consultation is recorded
        if user and user.is_active:
            return user

        # Strategy 2: Check if visit exists and has a doctor assigned (fallback)
        if 'visit' in data and data['visit']:
            visit = data['visit']
            if hasattr(visit, 'doctor') and visit.doctor:
                return visit.doctor

        # Only use the requesting user who performed the consultation
        # No fallback to other doctors - the actual performer is recorded
        return None

    @extend_schema(tags=["Consultation"], summary="End", description="End a consultation session and log audit.")
    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        """End a consultation session and log audit."""
        from patients.models import Visit

        session = self.get_object()
        old_status = session.status
        session.status = 'completed'
        session.ended_at = timezone.now()
        session.save()

        # Deactivate any active queue item for this patient in this room
        queue_item = ConsultationQueue.objects.filter(
            room=session.room,
            patient=session.patient,
            is_active=True
        ).first()
        if queue_item:
            queue_item.is_active = False
            queue_item.called_at = session.ended_at
            queue_item.save(update_fields=['is_active', 'called_at'])

        # Mark consultation clinic leg complete; close visit only when all clinics are done.
        if session.visit:
            visit = session.visit
            old_visit_status = visit.status
            old_completed = list(visit.completed_clinics or [])
            from consultation.session_completion import finalize_consultation_session_for_visit

            visit_completed = finalize_consultation_session_for_visit(session, user=request.user)
            visit.save(update_fields=['completed_clinics', 'status'])
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='visit',
                object_id=str(visit.id),
                module='consultation',
                object_repr=f'Visit {visit.visit_id}',
                description=(
                    f'Updated visit {visit.visit_id} after consultation session ended '
                    f'(completed_clinics={visit.completed_clinics})'
                ),
                old_values={'status': old_visit_status, 'completed_clinics': old_completed},
                new_values={
                    'status': visit.status,
                    'completed_clinics': visit.completed_clinics,
                },
                request=self.request,
            )
            if visit_completed or visit_should_close_after_clinic_completion(visit):
                fin = finalize_consultation_artifacts_for_visit(visit, session_terminal_status="completed")
                if fin["sessions_updated"] or fin["queue_items_deactivated"]:
                    AuditService.log_activity(
                        user=self.request.user,
                        action='update',
                        object_type='visit',
                        object_id=str(visit.id),
                        module='consultation',
                        object_repr=f'Visit {visit.visit_id}',
                        description=f'Closed sibling open sessions/queue after visit completion: {fin}',
                        old_values={'status': visit.status},
                        new_values=fin,
                        request=self.request,
                    )

        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='consultation_session',
            object_id=str(session.id),
            module='consultation',
            object_repr=f'Session {session.session_id}',
            description=f'Ended consultation session {session.session_id}',
            old_values={'status': old_status},
            new_values={'status': 'completed', 'ended_at': str(session.ended_at)},
            request=self.request,
        )
        return Response(ConsultationSessionSerializer(session).data)

    @extend_schema(tags=["Consultation"], summary="End not seen")
    @action(detail=True, methods=['post'], url_path='end-not-seen')
    def end_not_seen(self, request, pk=None):
        session = self.get_object()
        visit = session.visit
        if not visit:
            return Response(
                {'detail': 'No visit is attached to this session.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = str(request.data.get('reason') or '').strip()
        result = close_visit_workflow(
            visit=visit,
            actor=request.user,
            reason=reason,
            source_stage='consultation_session',
        )
        return Response({'detail': 'Session ended as not seen.', **result})

    @extend_schema(tags=["Consultation"], summary="Pause", description="Pause an active session; accumulate active time into active_seconds.")
    @action(detail=True, methods=['post'])
    def pause(self, request, pk=None):
        """Pause an active session; accumulate active time into active_seconds."""
        session = self.get_object()
        if session.status != 'active':
            return Response(
                {'detail': 'Only active sessions can be paused.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        base = int(session.active_seconds or 0)
        anchor = session.last_resumed_at or session.started_at
        if anchor:
            delta = (now - anchor).total_seconds()
            if delta > 0:
                base += int(delta)

        old_status = session.status
        session.active_seconds = base
        session.status = 'paused'
        session.paused_at = now
        session.save(update_fields=['active_seconds', 'status', 'paused_at'])

        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='consultation_session',
            object_id=str(session.id),
            module='consultation',
            object_repr=f'Session {session.session_id}',
            description=f'Paused consultation session {session.session_id}',
            old_values={'status': old_status},
            new_values={'status': session.status, 'paused_at': str(session.paused_at), 'active_seconds': session.active_seconds},
            request=self.request,
        )
        return Response(ConsultationSessionSerializer(session).data)

    @extend_schema(tags=["Consultation"], summary="Resume", description="Resume a paused session.")
    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        """Resume a paused session."""
        session = self.get_object()
        if session.status != 'paused':
            return Response(
                {'detail': 'Only paused sessions can be resumed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        blocking = (
            ConsultationSession.objects.filter(
                patient_id=session.patient_id,
                room_id=session.room_id,
                status='active',
            )
            .exclude(pk=session.pk)
            .exists()
        )
        if blocking:
            return Response(
                {
                    'detail': (
                        'Another active consultation exists for this patient in this room. '
                        'Pause or complete it before resuming this session.'
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        old_status = session.status
        session.status = 'active'
        session.last_resumed_at = timezone.now()
        session.save(update_fields=['status', 'last_resumed_at'])

        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='consultation_session',
            object_id=str(session.id),
            module='consultation',
            object_repr=f'Session {session.session_id}',
            description=f'Resumed consultation session {session.session_id}',
            old_values={'status': old_status},
            new_values={'status': session.status, 'last_resumed_at': str(session.last_resumed_at)},
            request=self.request,
        )
        return Response(ConsultationSessionSerializer(session).data)

    @extend_schema(tags=["Consultation"], summary="Comprehensive analytics", description="Comprehensive consultation analytics combining all metrics.")
    @action(detail=False, methods=['get'], url_path='comprehensive-analytics')
    def comprehensive_analytics(self, request):
        """
        Comprehensive consultation analytics combining all metrics.
        Requires start and end date parameters.
        """
        from common.module_analytics import parse_analytics_dates
        from pharmacy.models import Prescription
        from laboratory.models import LabOrder
        from nursing.models import NursingOrder
        from .analytics import build_comprehensive_consultation_analytics

        dates = parse_analytics_dates(request)
        if isinstance(dates, Response):
            return dates

        start_date, end_date, _all_time = dates

        # Get consultation sessions for the period
        base = (
            ConsultationSession.objects
            .select_related('patient', 'doctor')
            .filter(started_at__gte=start_date, started_at__lte=end_date)
            .exclude(status='cancelled')
        )
        base = self.scope_queryset(base)

        analytics = build_comprehensive_consultation_analytics(base, start_date, end_date)

        completed_session_visits = list(
            base.filter(status='completed')
            .exclude(visit__isnull=True)
            .values_list('visit_id', flat=True)
            .distinct()
        )
        analytics['clinical_outcomes'] = {
            'prescriptions': Prescription.objects.filter(visit_id__in=completed_session_visits).count() if completed_session_visits else 0,
            'lab_orders': LabOrder.objects.filter(visit_id__in=completed_session_visits).count() if completed_session_visits else 0,
            'nursing_orders': NursingOrder.objects.filter(visit_id__in=completed_session_visits).count() if completed_session_visits else 0,
        }

        period_referrals = Referral.objects.filter(
            referred_at__gte=start_date,
            referred_at__lte=end_date
        )
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            clinic_id = resolve_clinic_id(self.request.user)
            if clinic_id is not None:
                period_referrals = period_referrals.filter(
                    Q(visit__location_clinic=clinic_id) | Q(session__location_clinic=clinic_id)
                )
        analytics['referrals'] = {
            'total': period_referrals.count(),
            'pending': period_referrals.exclude(status__in=['closed', 'cancelled']).count(),
            'completed': period_referrals.filter(status='closed').count(),
        }

        period_diagnoses = Diagnosis.objects.filter(
            diagnosed_at__gte=start_date,
            diagnosed_at__lte=end_date
        )
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            clinic_id = resolve_clinic_id(self.request.user)
            if clinic_id is not None:
                period_diagnoses = period_diagnoses.filter(
                    Q(visit__location_clinic=clinic_id) | Q(session__location_clinic=clinic_id)
                )
        analytics['diagnoses'] = {
            'total': period_diagnoses.count(),
            'by_certainty': {
                certainty: period_diagnoses.filter(certainty=certainty).count()
                for certainty in ['confirmed', 'probable', 'possible']
            }
        }

        from common.analytics_export import maybe_export_analytics

        exported = maybe_export_analytics(request, analytics, module_key="consultation")
        if exported is not None:
            return exported
        return Response(analytics)

    @extend_schema(tags=["Consultation"], summary="Stats", description="Get consultation statistics for dashboard.")
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get consultation statistics for dashboard."""
        from django.db.models import Count, Q, Avg, Sum
        from datetime import timedelta
        from django.utils import timezone as tz
        
        from common.report_period import local_month_bounds_to_today, local_week_bounds

        now = tz.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start_date, _week_end_date = local_week_bounds()
        week_start = today_start.replace(
            year=week_start_date.year,
            month=week_start_date.month,
            day=week_start_date.day,
        )
        month_start_date, _ = local_month_bounds_to_today()
        month_start = today_start.replace(
            year=month_start_date.year,
            month=month_start_date.month,
            day=month_start_date.day,
        )
        
        # Get current user's sessions if filtering by doctor
        doctor_id = request.query_params.get('doctor', None)
        if doctor_id:
            sessions_qs = ConsultationSession.objects.filter(doctor_id=doctor_id)
        else:
            sessions_qs = ConsultationSession.objects.all()
        sessions_qs = self.scope_queryset(sessions_qs)
        
        # Today's stats
        today_sessions = sessions_qs.filter(started_at__gte=today_start)
        today_stats = {
            'sessions': today_sessions.count(),
            'active': today_sessions.filter(status='active').count(),
            'completed': today_sessions.filter(status='completed').count(),
            'patients': today_sessions.values('patient').distinct().count(),
        }
        
        # Calculate average duration for today's completed sessions
        completed_today = today_sessions.filter(status='completed', ended_at__isnull=False)
        avg_duration = 0
        if completed_today.exists():
            durations = []
            for session in completed_today:
                if session.ended_at and session.started_at:
                    duration = (session.ended_at - session.started_at).total_seconds() / 60
                    durations.append(duration)
            if durations:
                avg_duration = sum(durations) / len(durations)
        
        today_stats['avg_duration'] = round(avg_duration, 1)
        
        # Get prescriptions, lab orders, nursing orders count for today
        from pharmacy.models import Prescription
        from laboratory.models import LabOrder
        from nursing.models import NursingOrder
        
        today_visits = set(today_sessions.values_list('visit_id', flat=True).exclude(visit__isnull=True))
        today_stats['prescriptions'] = Prescription.objects.filter(visit_id__in=today_visits).count() if today_visits else 0
        today_stats['lab_orders'] = LabOrder.objects.filter(visit_id__in=today_visits).count() if today_visits else 0
        today_stats['nursing_orders'] = NursingOrder.objects.filter(visit_id__in=today_visits).count() if today_visits else 0
        
        # Week stats
        week_sessions = sessions_qs.filter(started_at__gte=week_start)
        week_stats = {
            'sessions': week_sessions.count(),
            'patients': week_sessions.values('patient').distinct().count(),
        }
        
        # Week by day
        week_by_day = []
        for i in range(7):
            day_start = week_start + timedelta(days=i)
            day_end = day_start + timedelta(days=1)
            day_sessions = week_sessions.filter(started_at__gte=day_start, started_at__lt=day_end)
            week_by_day.append({
                'day': day_start.strftime('%a'),
                'count': day_sessions.count(),
            })
        
        # Month stats
        month_sessions = sessions_qs.filter(started_at__gte=month_start)
        month_visits = set(month_sessions.values_list('visit_id', flat=True).exclude(visit__isnull=True))
        month_stats = {
            'sessions': month_sessions.count(),
            'patients': month_sessions.values('patient').distinct().count(),
            'prescriptions': Prescription.objects.filter(visit_id__in=month_visits).count() if month_visits else 0,
            'lab_orders': LabOrder.objects.filter(visit_id__in=month_visits).count() if month_visits else 0,
        }
        
        # Clinic breakdown (by room clinic ForeignKey)
        from organization.models import Clinic
        clinic_breakdown = []
        for clinic in Clinic.objects.filter(is_active=True):
            clinic_rooms = ConsultationRoom.objects.filter(clinic=clinic, is_active=True)
            clinic_sessions = month_sessions.filter(room__in=clinic_rooms)
            if clinic_sessions.exists():
                clinic_breakdown.append({
                    'clinic': clinic.name,
                    'count': clinic_sessions.count(),
                })
        
        # Recent sessions (last 5)
        recent_sessions = sessions_qs.filter(status='completed').order_by('-ended_at')[:5]
        recent_sessions_data = []
        for session in recent_sessions:
            duration = 0
            if session.ended_at and session.started_at:
                duration = round((session.ended_at - session.started_at).total_seconds() / 60, 0)
            
            # Calculate time ago
            dt = session.ended_at or session.started_at
            time_ago = 'Unknown'
            if dt:
                diff = timezone.now() - dt
                if diff.days > 0:
                    time_ago = f'{diff.days} day{"s" if diff.days > 1 else ""} ago'
                else:
                    hours = diff.seconds // 3600
                    if hours > 0:
                        time_ago = f'{hours} hour{"s" if hours > 1 else ""} ago'
                    else:
                        minutes = diff.seconds // 60
                        time_ago = f'{minutes} min{"s" if minutes > 1 else ""} ago'
            
            recent_sessions_data.append({
                'id': session.id,
                'patient': session.patient.get_full_name(),
                'diagnosis': session.assessment or 'N/A',
                'duration': int(duration),
                'time': time_ago,
            })
        
        # Queue stats
        queue_qs = ConsultationQueue.objects.filter(is_active=True)
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            q_clinic_id = resolve_clinic_id(self.request.user)
            if q_clinic_id is not None:
                queue_qs = queue_qs.filter(room__clinic=q_clinic_id)
        queue_count = queue_qs.count()
        
        # Referrals stats
        pending_qs = Referral.objects.filter(status__in=['draft', 'sent'])
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            r_clinic_id = resolve_clinic_id(self.request.user)
            if r_clinic_id is not None:
                pending_qs = pending_qs.filter(
                    Q(visit__location_clinic=r_clinic_id) | Q(session__location_clinic=r_clinic_id)
                )
        pending_referrals = pending_qs.count()
        
        return Response({
            'today': today_stats,
            'week': {
                **week_stats,
                'by_day': week_by_day,
            },
            'month': month_stats,
            'clinic_breakdown': clinic_breakdown,
            'recent_sessions': recent_sessions_data,
            'queue_count': queue_count,
            'pending_referrals': pending_referrals,
            'active_sessions': today_stats['active'],
            'completed_today': today_stats['completed'],
        })

    @extend_schema(tags=["Consultation"], summary="Workspace bundle", description="Diagnoses, orders, prescriptions, and vitals for the consultation room in one request.")
    @action(detail=True, methods=['get'], url_path='workspace-bundle')
    def workspace_bundle(self, request, pk=None):
        """Diagnoses, orders, prescriptions, and vitals for the consultation room in one request."""
        session = self.get_object()
        from .session_bundle import build_session_workspace_bundle

        return Response(build_session_workspace_bundle(session))

    @extend_schema(tags=["Consultation"], summary="Resolve for visit", description="Return the best-matching session for a visit (e.g. latest completed report).")
    @action(detail=False, methods=['get'], url_path='resolve-for-visit')
    def resolve_for_visit(self, request):
        """Return the best-matching session for a visit (e.g. latest completed report)."""
        visit_id = request.query_params.get('visit')
        if not visit_id:
            return Response({'detail': 'visit is required'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.filter_queryset(self.get_queryset()).filter(visit_id=visit_id)
        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        patient_id = request.query_params.get('patient')
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        ordering = (request.query_params.get('ordering') or '-ended_at').strip()
        if ordering.startswith('-'):
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by(ordering)
        session = qs.first()
        if not session:
            return Response({'detail': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(session).data)

    @extend_schema(tags=["Consultation"], summary="Room day counts", description="Session counts per room for a calendar day (one aggregate query).")
    @action(detail=False, methods=['get'], url_path='room-day-counts')
    def room_day_counts(self, request):
        """Session counts per room for a calendar day (one aggregate query)."""
        day = parse_date(request.query_params.get('date') or '') or timezone.localdate()
        qs = self.filter_queryset(self.get_queryset()).filter(started_at__date=day)
        rows = qs.values('room').annotate(count=Count('id'))
        counts = {
            str(row['room']): row['count']
            for row in rows
            if row['room'] is not None
        }
        return Response({'counts': counts})

    @extend_schema(tags=["Consultation"], summary="History stats", description="Dashboard cards for consultation history (replaces 4 parallel COUNT list calls).")
    @action(detail=False, methods=['get'], url_path='history-stats')
    def history_stats(self, request):
        """
        Dashboard cards for consultation history (replaces 4 parallel COUNT list calls).

        Accepts the same list filters as ``GET /consultation/sessions/`` plus:
        - ``calendar_today``: ISO date for the "Today" card (client local today)
        - ``week_start`` / ``week_end``: inclusive bounds for the "This week" card
        """
        from django.utils import timezone
        from django.utils.dateparse import parse_date

        calendar_today = parse_date(request.query_params.get('calendar_today') or '') or timezone.localdate()
        week_start = parse_date(request.query_params.get('week_start') or '') or calendar_today
        week_end = parse_date(request.query_params.get('week_end') or '') or calendar_today

        from common.list_stats import viewset_queryset_excluding_params

        base = viewset_queryset_excluding_params(self, frozenset({'status', 'page', 'page_size', 'ordering'}))
        # Today / this-week cards use calendar bounds, not the list date tab — but
        # still respect doctor, clinic, search, etc.
        scoped = viewset_queryset_excluding_params(
            self,
            frozenset({
                'status',
                'page',
                'page_size',
                'ordering',
                'date',
                'start_date',
                'end_date',
                'calendar_today',
                'week_start',
                'week_end',
            }),
        )

        return Response({
            'today': scoped.filter(started_at__date=calendar_today).count(),
            'thisWeek': scoped.filter(
                started_at__date__gte=week_start,
                started_at__date__lte=week_end,
            ).count(),
            'inProgress': base.filter(status='active').count(),
            'completed': base.filter(status='completed').count(),
        })

    @extend_schema(tags=["Consultation"], summary="Report", description="Download consultation report as PDF.")
    @action(detail=True, methods=['get'], url_path='report')
    def download_report(self, request, pk=None):
        """Download consultation report as PDF."""
        session = self.get_object()
        from .report_pdf import build_consultation_report_pdf
        return build_consultation_report_pdf(session)


@document_viewset(tag="Consultation", resource="consultation queues")
class ConsultationQueueViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing consultation queue."""
    
    clinic_filter_field = 'room__clinic'
    serializer_class = ConsultationQueueSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['room', 'patient', 'is_active', 'visit']
    ordering_fields = ['priority', 'queued_at', 'called_at']
    ordering = ['priority', 'queued_at']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ConsultationQueue.objects.none()
        
        qs = (
            ConsultationQueue.objects.all()
            .select_related('room', 'patient', 'visit')
            .prefetch_related('visit__vital_readings')
        )

        # Date filtering (match VisitViewSet pattern) but based on queued_at
        # because queued_at represents "Sent to Room".
        date = self.request.query_params.get('date')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if date:
            qs = qs.filter(queued_at__date=date)
        elif start_date:
            qs = qs.filter(queued_at__date__gte=start_date)
            if end_date:
                qs = qs.filter(queued_at__date__lte=end_date)
        elif end_date:
            qs = qs.filter(queued_at__date__lte=end_date)

        return self.scope_queryset(qs)

    @extend_schema(tags=["Consultation"], summary="By visits", description="Active queue rows for a set of visit IDs.")
    @action(detail=False, methods=['get'], url_path='by-visits')
    def by_visits(self, request):
        """
        Active queue rows for a set of visit IDs.
        Used by nursing pool to map visits → consultation room name / queued_at.
        """
        raw = (request.query_params.get('visit_ids') or '').strip()
        if not raw:
            return Response({'results': []})
        ids = []
        for part in raw.split(','):
            part = part.strip()
            if not part:
                continue
            try:
                vid = int(part)
                if vid > 0:
                    ids.append(vid)
            except ValueError:
                continue
        if not ids:
            return Response({'results': []})
        qs = self.scope_queryset(
            self.get_queryset().filter(visit_id__in=ids, is_active=True)
        )
        return Response({'results': ConsultationQueueByVisitSerializer(qs, many=True).data})

    def perform_create(self, serializer):
        """Create queue item(s) with duplicate prevention.
        
        For multi-clinic visits, create queue entries for all matching clinic rooms.
        """
        from django.db import IntegrityError
        from organization.models import Clinic
        
        room = serializer.validated_data.get('room')
        patient = serializer.validated_data.get('patient')
        visit = serializer.validated_data.get('visit')

        if room is not None:
            assert_room_accepting_patients(room, request=self.request)

        open_session_qs = ConsultationSession.objects.filter(
            status__in=['active', 'paused'],
        ).select_related('room', 'doctor')
        if visit:
            open_session = open_session_qs.filter(visit=visit).first()
        elif patient:
            open_session = open_session_qs.filter(patient=patient).first()
        else:
            open_session = None
        if open_session:
            from rest_framework.exceptions import ValidationError
            room_label = open_session.room.name if open_session.room else 'a consultation room'
            doctor_label = (
                open_session.doctor.get_full_name()
                if open_session.doctor
                else 'a doctor'
            )
            raise ValidationError({
                'non_field_errors': [
                    f'Patient is already in consultation with {doctor_label} in {room_label}.',
                ],
            })

        if visit:
            if visit.status != 'in_progress':
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    'visit': [
                        'Visit must be sent to nursing (in progress) before adding to consultation queue.',
                    ],
                })

            from patients.nursing_leg_status import (
                consultation_leg_state,
                visit_service_clinics,
            )

            consult_leg = consultation_leg_state(
                visit_clinics=visit_service_clinics(visit),
                completed_clinics=visit.completed_clinics or [],
                has_active_queue=ConsultationQueue.objects.filter(
                    visit=visit,
                    is_active=True,
                ).exists(),
                has_open_session=False,
            )
            if consult_leg == 'completed':
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    'non_field_errors': [
                        'Consultation for this visit is already completed.',
                    ],
                })
        
        # Deactivate any existing active queue items for this patient
        ConsultationQueue.objects.filter(
            patient=patient,
            is_active=True
        ).exclude(room=room).update(is_active=False)
        
        # Check if patient is already in queue for this room (active)
        existing = ConsultationQueue.objects.filter(
            room=room,
            patient=patient,
            is_active=True
        ).first()
        
        if existing:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                'non_field_errors': [f'Patient is already in the queue for {room.name}']
            })
        
        # Save the queue item
        queue_item = serializer.save()

        # Physio leg: create order as soon as patient is sent to a consultation room.
        if visit:
            try:
                from physiotherapy.visit_orders import ensure_physio_order_for_visit, visit_has_physio_clinic

                if visit_has_physio_clinic(visit):
                    order, created = ensure_physio_order_for_visit(
                        visit,
                        ordered_by=self.request.user,
                        referral_source="consultation_queue",
                    )
                    if created and order:
                        logger.info(
                            'Created automatic physio order %s for patient %s (visit %s)',
                            order.id,
                            patient,
                            visit.pk,
                        )
            except Exception as e:
                logger.error('Failed to create physio order on queue: %s', e)

        # If this visit has multiple clinics, create queue entries for ALL matching clinic rooms
        if visit and hasattr(visit, 'clinics') and visit.clinics and len(visit.clinics) > 1:
            visit_clinics = visit.clinics

            # Check if Eye Clinic is one of the clinics
            has_eye = any('eye' in clinic.lower() for clinic in visit_clinics)
            
            # Create eye order if needed
            if has_eye:
                try:
                    from eyecare.models import EyeOrder
                    
                    # Check if eye order already exists for this visit
                    eye_order_exists = EyeOrder.objects.filter(
                        patient=patient,
                        visit=visit,
                        status__in=['pending', 'scheduled', 'in_progress']
                    ).exists()
                    
                    if not eye_order_exists:
                        from common.order_location import resolve_order_location_clinic

                        eye_kwargs = dict(
                            patient=patient,
                            ordered_by=self.request.user,
                            visit=visit,
                            consultation_session=None,
                            chief_complaint=f'Multi-clinic visit: {", ".join(visit_clinics)}',
                            visual_acuity_od='',
                            visual_acuity_os='',
                            visual_acuity_ou='',
                            refraction_od='',
                            refraction_os='',
                            iop_od=None,
                            iop_os=None,
                            diagnosis='',
                            treatment_plan='',
                            special_instructions='Automatically created from multi-clinic visit',
                            priority='routine',
                            status='scheduled',
                            scheduled_at=timezone.now(),
                        )
                        clinic = resolve_order_location_clinic(
                            visit=visit,
                            user=self.request.user,
                        )
                        if clinic is not None:
                            eye_kwargs['location_clinic'] = clinic
                        EyeOrder.objects.create(**eye_kwargs)
                        logger.info(f'Created automatic eye order for patient {patient} from multi-clinic visit')
                except Exception as e:
                    logger.error(f'Failed to create eye order: {e}')
            
            # Find all active consultation rooms for NON-physio clinics
            non_physio_clinics = [
                c for c in visit_clinics
                if 'physiotherapy' not in c.lower() and 'eye' not in c.lower()
            ]
            
            if non_physio_clinics:
                matching_rooms = ConsultationRoom.objects.filter(
                    clinic__name__in=non_physio_clinics,
                    status='active',
                    is_active=True
                ).exclude(id=room.id)  # Exclude the room we just created
                
                # Create queue items for each matching room
                for matching_room in matching_rooms:
                    try:
                        # Check if already in queue for this room
                        already_queued = ConsultationQueue.objects.filter(
                            room=matching_room,
                            patient=patient,
                            is_active=True
                        ).exists()
                        
                        if not already_queued:
                            ConsultationQueue.objects.create(
                                room=matching_room,
                                patient=patient,
                                visit=visit,
                                priority=consultation_queue_priority_for_visit(visit),
                                notes=queue_item.notes,
                                is_active=True
                            )
                    except Exception as e:
                        # Log error but don't fail the entire operation
                        logger.error(f'Failed to create queue item for room {matching_room.name}: {e}')
        
        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='consultation_queue',
            object_id=str(queue_item.id),
            module='consultation',
            object_repr=f'Queue item for {queue_item.patient.get_full_name()} in {queue_item.room.name}',
            description=f'Added {queue_item.patient.get_full_name()} to consultation queue for {queue_item.room.name}{presence_override_audit_suffix(self.request)}',
            new_values={
                'room': queue_item.room.name,
                'patient': queue_item.patient.get_full_name(),
                'priority': queue_item.priority,
                'visit': str(queue_item.visit.id) if queue_item.visit else None,
            },
            request=self.request,
        )

        # Notify the doctor checked into this room (if any).
        try:
            patient_name = queue_item.patient.get_full_name()
            room_name = queue_item.room.name
            notify_doctor_in_room(
                queue_item.room,
                title="Patient sent to Consultation",
                message=f"{patient_name} has been sent to {room_name} for consultation.",
                action_url=f"/consultation/room/{queue_item.room.id}",
                object_type='consultation_queue',
                object_id=str(queue_item.id),
            )
        except Exception:
            # Notifications must never break queue operations
            pass

    def perform_update(self, serializer):
        """
        Update queue item safely.

        Staging issue: reassigning a patient to another room triggers a DB unique constraint
        (`unique_active_queue_item`) and bubbles up as 500. We convert that into a 400 with a
        clear message (and also pre-check to avoid IntegrityError where possible).
        """
        from django.db import IntegrityError, transaction
        from rest_framework.exceptions import ValidationError

        instance = self.get_object()
        old_room = instance.room

        # Check if room is being changed
        new_room = serializer.validated_data.get('room')
        if new_room and new_room != instance.room:
            assert_room_accepting_patients(new_room, request=self.request)
            # If reassigning to a different room, ensure no duplicate active queue item
            existing = ConsultationQueue.objects.filter(
                room=new_room,
                patient=instance.patient,
                is_active=True,
            ).exclude(pk=instance.pk).first()
            if existing:
                raise ValidationError({
                    'non_field_errors': [f'Patient is already in the queue for {new_room.name}']
                })

        try:
            with transaction.atomic():
                updated = serializer.save()
        except IntegrityError:
            # Fallback if DB constraint still triggers (race conditions)
            new_room = serializer.validated_data.get('room', instance.room)
            raise ValidationError({
                'non_field_errors': [f'Patient is already in the queue for {new_room.name}']
            })

        # Log audit
        try:
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='consultation_queue',
                object_id=str(updated.id),
                module='consultation',
                object_repr=f'Queue item {updated.id} reassigned',
                description=f'Queue item reassigned from {old_room.name} to {updated.room.name}{presence_override_audit_suffix(self.request)}',
                old_values={
                    'room': old_room.name,
                    'priority': instance.priority,
                },
                new_values={
                    'room': updated.room.name,
                    'priority': updated.priority,
                },
                request=self.request,
            )
        except Exception as audit_error:
            # Audit logging should never break the main operation
            logger.warning(f"Failed to log audit for queue update {updated.id}: {audit_error}")

        # If room changed, notify the doctor in the target room.
        try:
            if old_room.id != updated.room.id:
                patient_name = updated.patient.get_full_name()
                notify_doctor_in_room(
                    updated.room,
                    title="Patient reassigned to Consultation room",
                    message=f"{patient_name} has been reassigned to {updated.room.name}.",
                    action_url=f"/consultation/room/{updated.room.id}",
                    object_type='consultation_queue',
                    object_id=str(updated.id),
                )
        except Exception:
            pass
    
    @extend_schema(tags=["Consultation"], summary="Call", description="Call a patient from the queue.")
    @action(detail=True, methods=['post'])
    def call(self, request, pk=None):
        """Call a patient from the queue."""
        queue_item = self.get_object()
        queue_item.called_at = timezone.now()
        queue_item.is_active = False
        queue_item.save()
        return Response(ConsultationQueueSerializer(queue_item).data)

    @extend_schema(tags=["Consultation"], summary="Mark left")
    @action(detail=True, methods=['post'], url_path='mark-left')
    def mark_left(self, request, pk=None):
        queue_item = self.get_object()
        visit = queue_item.visit
        if not visit:
            queue_item.called_at = timezone.now()
            queue_item.is_active = False
            queue_item.save(update_fields=['called_at', 'is_active'])
            return Response({'detail': 'Queue row deactivated (no visit linked).'})

        reason = str(request.data.get('reason') or '').strip()
        result = close_visit_workflow(
            visit=visit,
            actor=request.user,
            reason=reason,
            source_stage='consultation_queue',
        )
        return Response({'detail': 'Patient marked left from queue.', **result})


@document_viewset(tag="Consultation", resource="referrals")
class ReferralViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing referrals."""
    serializer_class = ReferralSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        "patient",
        "visit",
        "session",
        "referred_by",
        "specialty",
        "facility",
        "status",
        "urgency",
    ]
    search_fields = ["referral_id", "specialty", "facility", "reason", "clinical_summary"]
    ordering_fields = ["referred_at", "urgency"]
    ordering = ["-referred_at"]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Referral.objects.none()
        
        qs = (
            Referral.objects.all()
            .select_related(
                "patient",
                "patient__principal_staff",
                "visit",
                "visit__location_clinic",
                "session",
                "session__location_clinic",
                "referred_by",
                "created_by",
                "facility_partner",
                "referral_letter_acknowledged_by",
            )
            .prefetch_related(
                "responsibility_forms",
                "patient__principal_staff",
            )
        )

        qp = self.request.query_params
        if qp.get("exclude_draft", "").lower() in ("1", "true", "yes"):
            qs = qs.exclude(status="draft")

        exclude_status = qp.get("exclude_status")
        if exclude_status:
            for raw in exclude_status.split(","):
                st = raw.strip()
                if st:
                    qs = qs.exclude(status=st)

        date = qp.get("date")
        start_date = qp.get("start_date")
        end_date = qp.get("end_date")
        if date:
            qs = qs.filter(referred_at__date=date)
        elif start_date:
            qs = qs.filter(referred_at__date__gte=start_date)
            if end_date:
                qs = qs.filter(referred_at__date__lte=end_date)
        elif end_date:
            qs = qs.filter(referred_at__date__lte=end_date)

        return self.scope_queryset(qs)

    def scope_queryset(self, qs):
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            clinic_id = resolve_clinic_id(self.request.user)
            if clinic_id is not None:
                qs = qs.filter(
                    Q(visit__location_clinic=clinic_id) | Q(session__location_clinic=clinic_id)
                )
        return qs

    @extend_schema(tags=["Consultation"], summary="List stats", description="Tab counts for referrals queue (replaces parallel COUNT list calls).")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Tab counts for referrals queue (replaces parallel COUNT list calls)."""
        from common.list_stats import viewset_queryset_excluding_params
        from django.db.models import Count, Q

        qs = viewset_queryset_excluding_params(self, frozenset({'status', 'page', 'page_size', 'ordering'}))
        row = qs.aggregate(
            total=Count('pk'),
            submitted=Count('pk', filter=Q(status='submitted_to_records')),
            inReview=Count('pk', filter=Q(status='records_review')),
            approved=Count('pk', filter=Q(status='approved_for_forms')),
        )
        return Response({
            'total': row['total'] or 0,
            'submitted': row['submitted'] or 0,
            'inReview': row['inReview'] or 0,
            'approved': row['approved'] or 0,
        })

    def perform_create(self, serializer):
        """Create referral and log audit."""
        referral = serializer.save(
            created_by=self.request.user, referred_by=self.request.user
        )
        AuditService.log_activity(
            user=self.request.user,
            action="create",
            object_type="referral",
            object_id=str(referral.id),
            module="consultation",
            object_repr=f"Referral {referral.referral_id}",
            description=(
                f"Created referral {referral.referral_id} to {referral.specialty} "
                f"at {referral.facility}"
            ),
            new_values={
                "referral_id": referral.referral_id,
                "specialty": referral.specialty,
                "facility": referral.facility,
                "facility_type": referral.facility_type,
                "facility_partner_id": referral.facility_partner_id,
                "facility_address_snapshot": referral.facility_address_snapshot,
                "urgency": referral.urgency,
            },
            request=self.request,
        )

    @staticmethod
    def _ranges_overlap(a_start, a_end, b_start, b_end):
        return not (a_end < b_start or a_start > b_end)

    def _overlaps_active_window(self, referral, valid_from, valid_to, today):
        """True if [valid_from, valid_to] overlaps any still-current active form."""
        for f in referral.responsibility_forms.filter(status="active"):
            if f.valid_to < today:
                continue
            if self._ranges_overlap(
                valid_from, valid_to, f.valid_from, f.valid_to
            ):
                return True
        return False

    @extend_schema(tags=["Consultation"], summary="Forms", description="List or create responsibility form issuances for this referral.")
    @action(detail=True, methods=["get", "post"])
    def forms(self, request, pk=None):
        """List or create responsibility form issuances for this referral."""
        referral = self.get_object()

        if request.method == "GET":
            qs = referral.responsibility_forms.all().order_by(
                "sequence_number", "id"
            )
            return Response(
                ResponsibilityFormIssuanceSerializer(qs, many=True).data
            )

        # POST — issue a new form
        valid_from_raw = request.data.get("valid_from")
        valid_to_raw = request.data.get("valid_to")
        notes = str(request.data.get("notes") or "").strip()
        override_active = str(
            request.data.get("override_active") or ""
        ).lower() in ("1", "true", "yes")
        override_reason = str(request.data.get("override_reason") or "").strip()

        vf = parse_date(str(valid_from_raw)) if valid_from_raw else None
        vt = parse_date(str(valid_to_raw)) if valid_to_raw else None
        if not vf or not vt:
            return Response(
                {"detail": "valid_from and valid_to are required (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if vf > vt:
            return Response(
                {"detail": "valid_from must be on or before valid_to."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.localdate()
        if self._overlaps_active_window(referral, vf, vt, today):
            if not override_active or not override_reason:
                return Response(
                    {
                        "detail": (
                            "These dates overlap a current active responsibility "
                            "form. Send override_active=true and override_reason."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        max_seq = referral.responsibility_forms.aggregate(m=Max("sequence_number"))[
            "m"
        ]
        next_seq = (max_seq or 0) + 1

        doc = request.FILES.get("document_file")

        try:
            with transaction.atomic():
                issuance = ResponsibilityFormIssuance.objects.create(
                    referral=referral,
                    sequence_number=next_seq,
                    valid_from=vf,
                    valid_to=vt,
                    status="active",
                    hospital_name_snapshot=(referral.facility or "")[:200],
                    notes=notes,
                    issued_by=request.user,
                    document_file=doc if doc else None,
                )
                # Reopen Medical Records queue when a new unstamped form is added
                # after the referral was already acknowledged.
                referral.refresh_from_db()
                if referral.status in ("approved_for_forms", "scheduled"):
                    referral.status = "submitted_to_records"
                    referral.save(update_fields=["status"])
        except IntegrityError:
            return Response(
                {"detail": "Could not allocate sequence number — retry."},
                status=status.HTTP_409_CONFLICT,
            )

        # Auto-generate the printable PDF unless the user uploaded their
        # own scan. Stored on document_file so re-prints are byte-identical
        # forever and audit can replay exactly what the hospital received.
        if not doc:
            try:
                from .pdfs import build_responsibility_form_pdf

                pdf_bytes = build_responsibility_form_pdf(referral, issuance)
                fname = (
                    f"responsibility_form_{referral.referral_id}_"
                    f"{issuance.sequence_number:03d}.pdf"
                )
                issuance.document_file.save(
                    fname, ContentFile(pdf_bytes), save=True
                )
            except Exception:
                logger.exception(
                    "Failed to auto-generate responsibility form PDF for "
                    "issuance %s on referral %s",
                    issuance.id,
                    referral.referral_id,
                )

        AuditService.log_activity(
            user=request.user,
            action="create",
            object_type="responsibility_form_issuance",
            object_id=str(issuance.id),
            module="consultation",
            object_repr=str(issuance),
            description=(
                f"Issued responsibility form #{issuance.sequence_number} "
                f"for referral {referral.referral_id}"
            ),
            new_values={
                "sequence_number": issuance.sequence_number,
                "valid_from": str(vf),
                "valid_to": str(vt),
            },
            request=request,
        )

        return Response(
            ResponsibilityFormIssuanceSerializer(issuance).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(tags=["Consultation"], summary="Letter/pdf", description="Stream the NPA-letterhead referral letter PDF for this referral.")
    @action(detail=True, methods=["get"], url_path="letter/pdf")
    def referral_letter_pdf(self, request, pk=None):
        """Stream the NPA-letterhead referral letter PDF for this referral."""
        referral = self.get_object()
        from .pdfs import build_referral_letter_pdf_response

        return build_referral_letter_pdf_response(referral)

    @extend_schema(tags=["Consultation"], summary="Forms/(?P<form pk>[^/.]+)/pdf", description="Stream the responsibility-form PDF for a specific issuance.", parameters=REFERRAL_FORM_PK_PARAMS)
    @action(
        detail=True,
        methods=["get"],
        url_path=r"forms/(?P<form_pk>[^/.]+)/pdf",
    )
    def form_pdf(self, request, pk=None, form_pk=None):
        """
        Stream the responsibility-form PDF for a specific issuance.

        Lazy-migration aware: if the issuance was created before the
        auto-generate code shipped, render on the fly and persist the
        bytes onto ``document_file`` so the next request is a direct
        file read.
        """
        referral = self.get_object()
        try:
            form_pk_int = int(form_pk)
        except (TypeError, ValueError):
            raise Http404("Invalid form id.")

        try:
            issuance = ResponsibilityFormIssuance.objects.get(
                pk=form_pk_int, referral=referral
            )
        except ResponsibilityFormIssuance.DoesNotExist:
            raise Http404("Form not found for this referral.")

        pdf_bytes: bytes | None = None
        if issuance.document_file:
            try:
                with issuance.document_file.open("rb") as fh:
                    pdf_bytes = fh.read()
            except (FileNotFoundError, OSError):
                pdf_bytes = None

        if pdf_bytes is None:
            from .pdfs import build_responsibility_form_pdf

            pdf_bytes = build_responsibility_form_pdf(referral, issuance)
            try:
                fname = (
                    f"responsibility_form_{referral.referral_id}_"
                    f"{issuance.sequence_number:03d}.pdf"
                )
                issuance.document_file.save(
                    fname, ContentFile(pdf_bytes), save=True
                )
            except Exception:
                logger.exception(
                    "Failed to persist responsibility form PDF for issuance %s",
                    issuance.id,
                )

        filename = (
            f"responsibility_form_{referral.referral_id}_"
            f"{issuance.sequence_number:03d}.pdf"
        )
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response

    @extend_schema(tags=["Consultation"], summary="Submit to records", description="Move a draft referral into the Medical Records queue.")
    @action(detail=True, methods=["post"])
    def submit_to_records(self, request, pk=None):
        """Move a draft referral into the Medical Records queue."""
        referral = self.get_object()
        if referral.status != "draft":
            return Response(
                {"detail": "Only draft referrals can be submitted to Medical Records."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not referral.responsibility_forms.exists():
            return Response(
                {
                    "detail": (
                        "Issue at least one responsibility form before submitting "
                        "to Medical Records."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        referral.status = "submitted_to_records"
        referral.submitted_at = timezone.now()
        referral.save(update_fields=["status", "submitted_at"])

        AuditService.log_activity(
            user=request.user,
            action="update",
            object_type="referral",
            object_id=str(referral.id),
            module="consultation",
            object_repr=f"Referral {referral.referral_id}",
            description=f"Submitted referral {referral.referral_id} to Medical Records",
            new_values={"status": referral.status},
            request=request,
        )

        return Response(ReferralSerializer(referral).data)

    @extend_schema(tags=["Consultation"], summary="Close referral", description="Close a referral file after Records acknowledgement.")
    @action(detail=True, methods=["post"])
    def close_referral(self, request, pk=None):
        """Close a referral file after Records acknowledgement."""
        referral = self.get_object()
        if referral.status not in ("approved_for_forms", "scheduled"):
            return Response(
                {
                    "detail": (
                        "Referral can only be closed once it is Records acknowledged."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        referral.status = "closed"
        referral.closed_at = timezone.now()
        referral.save(update_fields=["status", "closed_at"])

        AuditService.log_activity(
            user=request.user,
            action="update",
            object_type="referral",
            object_id=str(referral.id),
            module="consultation",
            object_repr=f"Referral {referral.referral_id}",
            description=f"Closed referral {referral.referral_id}",
            new_values={"status": "closed"},
            request=request,
        )

        return Response(ReferralSerializer(referral).data)

    @extend_schema(tags=["Consultation"], summary="Approve for forms", description="Medical Records: approve referral letter so Consultation may issue forms.")
    @action(detail=True, methods=["post"])
    def approve_for_forms(self, request, pk=None):
        """Medical Records: approve referral letter so Consultation may issue forms."""
        referral = self.get_object()
        if referral.status != "records_review":
            return Response(
                {
                    "detail": (
                        "Only referrals in Records Review can be approved for forms."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = timezone.now()
        referral.status = "approved_for_forms"
        referral.approved_at = now
        update_fields = ["status", "approved_at"]
        if not referral.reviewed_at:
            referral.reviewed_at = now
            update_fields.append("reviewed_at")
        referral.save(update_fields=update_fields)

        AuditService.log_activity(
            user=request.user,
            action="update",
            object_type="referral",
            object_id=str(referral.id),
            module="consultation",
            object_repr=f"Referral {referral.referral_id}",
            description=(
                f"Approved referral {referral.referral_id} for responsibility forms"
            ),
            new_values={"status": referral.status},
            request=request,
        )

        return Response(ReferralSerializer(referral).data)

    @extend_schema(tags=["Consultation"], summary="Return for correction", description="Medical Records: return referral to author for edits.")
    @action(detail=True, methods=["post"])
    def return_for_correction(self, request, pk=None):
        """Medical Records: return referral to author for edits."""
        referral = self.get_object()
        if referral.status not in ("submitted_to_records", "records_review"):
            return Response(
                {
                    "detail": (
                        "Only queued referrals can be returned for correction."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        notes = str(request.data.get("notes") or "").strip()
        referral.status = "returned_for_correction"
        stamp = timezone.now().strftime("%Y-%m-%d %H:%M")
        block = (
            f"\n\n[Returned for correction — {stamp}]\n{notes}"
            if notes
            else f"\n\n[Returned for correction — {stamp}]"
        )
        referral.notes = (referral.notes or "") + block
        referral.save(update_fields=["status", "notes"])

        AuditService.log_activity(
            user=request.user,
            action="update",
            object_type="referral",
            object_id=str(referral.id),
            module="consultation",
            object_repr=f"Referral {referral.referral_id}",
            description=f"Returned referral {referral.referral_id} for correction",
            new_values={"status": referral.status},
            request=request,
        )

        return Response(ReferralSerializer(referral).data)

    @extend_schema(tags=["Consultation"], summary="Update form status", description="Update responsibility-form issuance status (active / expired / revoked / used).")
    @action(detail=True, methods=["post"])
    def update_form_status(self, request, pk=None):
        """Update responsibility-form issuance status (active / expired / revoked / used)."""
        referral = self.get_object()
        form_id = request.data.get("form_id")
        new_status = request.data.get("status")
        if form_id in (None, "") or new_status in (None, ""):
            return Response(
                {"detail": "form_id and status are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            form_pk = int(form_id)
        except (TypeError, ValueError):
            return Response(
                {"detail": "form_id must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed = {c[0] for c in ResponsibilityFormIssuance.STATUS_CHOICES}
        if new_status not in allowed:
            return Response(
                {"detail": f"Invalid status. Allowed: {sorted(allowed)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            form = ResponsibilityFormIssuance.objects.get(pk=form_pk, referral=referral)
        except ResponsibilityFormIssuance.DoesNotExist:
            return Response(
                {"detail": "Form not found for this referral."},
                status=status.HTTP_404_NOT_FOUND,
            )
        old = form.status
        form.status = new_status
        form.save(update_fields=["status", "updated_at"])

        AuditService.log_activity(
            user=request.user,
            action="update",
            object_type="responsibility_form_issuance",
            object_id=str(form.id),
            module="consultation",
            object_repr=str(form),
            description=(
                f"Updated responsibility form #{form.sequence_number} status "
                f"for referral {referral.referral_id}: {old} → {new_status}"
            ),
            new_values={"status": new_status},
            request=request,
        )

        return Response(ResponsibilityFormIssuanceSerializer(form).data)

    @extend_schema(tags=["Consultation"], summary="Acknowledge responsibility form", description="Medical Records: stamp a printed responsibility-form slip.")
    @action(detail=True, methods=["post"])
    def acknowledge_responsibility_form(self, request, pk=None):
        """
        Medical Records: stamp a printed responsibility-form slip.

        Expects JSON body: {"form_id": <pk>}
        When every issuance on the referral has been stamped, the referral
        becomes Records acknowledged (``approved_for_forms``).
        """
        referral = self.get_object()
        form_id = request.data.get("form_id")
        if form_id in (None, ""):
            return Response(
                {"detail": "form_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            form_pk = int(form_id)
        except (TypeError, ValueError):
            return Response(
                {"detail": "form_id must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not ResponsibilityFormIssuance.objects.filter(
            pk=form_pk, referral_id=referral.pk
        ).exists():
            return Response(
                {"detail": "Form not found for this referral."},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            ref = Referral.objects.select_for_update().get(pk=referral.pk)
            form = ResponsibilityFormIssuance.objects.select_for_update().get(
                pk=form_pk,
                referral=ref,
            )
            if not form.records_acknowledged_at:
                form.records_acknowledged_at = timezone.now()
                form.records_acknowledged_by = request.user
                form.save(
                    update_fields=[
                        "records_acknowledged_at",
                        "records_acknowledged_by",
                        "updated_at",
                    ]
                )

            unstamped_exists = ref.responsibility_forms.filter(
                records_acknowledged_at__isnull=True
            ).exists()

            should_promote = (
                not unstamped_exists
                and ref.responsibility_forms.exists()
                and ref.status
                in ("submitted_to_records", "records_review")
            )

            if should_promote:
                ref.status = "approved_for_forms"
                update_fields = ["status"]
                if not ref.approved_at:
                    ref.approved_at = timezone.now()
                    update_fields.append("approved_at")
                ref.save(update_fields=update_fields)

        form.refresh_from_db()

        AuditService.log_activity(
            user=request.user,
            action="acknowledge",
            object_type="responsibility_form_issuance",
            object_id=str(form.id),
            module="consultation",
            object_repr=str(form),
            description=(
                f"Medical Records stamped responsibility form #{form.sequence_number} "
                f"for referral {referral.referral_id}"
            ),
            new_values={"records_acknowledged_at": str(form.records_acknowledged_at)},
            request=request,
        )

        return Response(ResponsibilityFormIssuanceSerializer(form).data)


@document_viewset(tag="Consultation", resource="ICD-10 codes", read_only=True)
class ICD10CodeViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for ICD-10 codes (read-only reference data)."""
    serializer_class = ICD10CodeSerializer
    pagination_class = LabCatalogPagination  # ICD-10 catalog (search + max 500)
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['code', 'description', 'category']
    ordering_fields = ['code', 'description']
    ordering = ['code']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ICD10Code.objects.none()
        
        return ICD10Code.objects.filter(is_active=True)

    @extend_schema(tags=["Consultation"], summary="Resolve", description="Exact ICD-10 code lookup (no paginated search).")
    @action(detail=False, methods=['get'], url_path='resolve')
    def resolve_code(self, request):
        """Exact ICD-10 code lookup (no paginated search)."""
        code = (request.query_params.get('code') or '').strip()
        if not code:
            return Response({'detail': 'code is required'}, status=status.HTTP_400_BAD_REQUEST)
        row = self.get_queryset().filter(code__iexact=code).first()
        if not row:
            return Response({'detail': 'ICD-10 code not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ICD10CodeSerializer(row).data)

    @extend_schema(tags=["Consultation"], summary="Stats", description="Aggregate statistics for the ICD-10 code catalog.")
    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        """Aggregate ICD-10 catalog statistics."""
        total = ICD10Code.objects.count()
        active = ICD10Code.objects.filter(is_active=True).count()
        total_diagnoses = Diagnosis.objects.count()

        categories = list(
            ICD10Code.objects.filter(is_active=True)
            .values('category')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        top_used_raw = list(
            Diagnosis.objects.filter(icd10_code__isnull=False)
            .values('icd10_code', 'icd10_code__code', 'icd10_code__description')
            .annotate(usage_count=Count('id'))
            .order_by('-usage_count')[:10]
        )
        top_used_clean = [
            {
                'code': row['icd10_code__code'],
                'description': row['icd10_code__description'],
                'usage_count': row['usage_count'],
            }
            for row in top_used_raw
        ]

        return Response({
            'total_codes': total,
            'active_codes': active,
            'inactive_codes': total - active,
            'total_diagnoses': total_diagnoses,
            'categories': categories,
            'top_used_codes': top_used_clean,
        })

    @extend_schema(tags=["Consultation"], summary="Categories", description="Distinct ICD-10 categories with code counts.")
    @action(detail=False, methods=['get'], url_path='categories')
    def categories(self, request):
        """List distinct categories with their code counts."""
        cats = list(
            ICD10Code.objects.filter(is_active=True)
            .values('category')
            .annotate(count=Count('id'))
            .order_by('category')
        )
        return Response({'results': cats, 'count': len(cats)})


@document_viewset(tag="Consultation", resource="diagnoses")
class DiagnosisViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing patient diagnoses."""

    clinic_filter_field = 'visit__location_clinic'
    serializer_class = DiagnosisSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'visit', 'session', 'icd10_code', 'status', 'certainty']
    search_fields = [
        'diagnosis_text',
        'icd10_code__code',
        'icd10_code__description',
        'patient__patient_id',
        'patient__surname',
        'patient__first_name',
    ]
    ordering_fields = ['diagnosed_at', 'status']
    ordering = ['-diagnosed_at']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Diagnosis.objects.none()

        return self.scope_queryset(
            Diagnosis.objects.all().select_related(
                'patient',
                'visit',
                'session',
                'icd10_code',
                'original_icd10_code',
                'diagnosed_by',
                'corrected_by',
            )
        )

    def _review_queryset(self):
        qs = self.get_queryset().filter(session__status='completed')
        params = self.request.query_params

        date_from = parse_date(params.get('date_from') or '')
        date_to = parse_date(params.get('date_to') or '')
        if date_from:
            qs = qs.filter(session__started_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(session__started_at__date__lte=date_to)

        corrected_only = (params.get('corrected_only') or '').lower()
        if corrected_only in ('1', 'true', 'yes'):
            qs = qs.filter(corrected_at__isnull=False)

        code = (params.get('code') or '').strip()
        if code:
            qs = qs.filter(icd10_code__code__iexact=code)

        return qs

    @extend_schema(tags=["Consultation"], summary="Exists", description="Whether a consultation session has at least one diagnosis.")
    @action(detail=False, methods=['get'], url_path='exists')
    def exists_for_session(self, request):
        """Whether a consultation session has at least one diagnosis."""
        session_id = request.query_params.get('session')
        if not session_id:
            return Response({'detail': 'session is required'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.filter_queryset(self.get_queryset()).filter(session_id=session_id)
        return Response({'exists': qs.exists()})

    @extend_schema(
        tags=["Consultation"],
        summary="Review list",
        description="Completed consultation diagnoses for Medical Records coding review.",
    )
    @action(detail=False, methods=['get'], url_path='review')
    def review(self, request):
        if not user_can_correct_diagnoses(request.user):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        qs = self.filter_queryset(self._review_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @extend_schema(
        tags=["Consultation"],
        summary="Correct ICD-10 code",
        description="Medical Records coding correction on a completed consultation diagnosis.",
    )
    @action(detail=True, methods=['post'], url_path='correct')
    def correct(self, request, pk=None):
        if not user_can_correct_diagnoses(request.user):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)

        diagnosis = self.get_object()
        if not diagnosis.session_id or diagnosis.session.status != 'completed':
            return Response(
                {'detail': 'Only diagnoses on completed consultations can be corrected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = DiagnosisCorrectionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        new_code = payload.validated_data['icd10_code']
        reason = payload.validated_data['reason']
        notes = (payload.validated_data.get('notes') or '').strip()

        if new_code.id == diagnosis.icd10_code_id:
            return Response({'detail': 'Select a different ICD-10 code.'}, status=status.HTTP_400_BAD_REQUEST)

        duplicate = Diagnosis.objects.filter(
            patient_id=diagnosis.patient_id,
            visit_id=diagnosis.visit_id,
            icd10_code_id=new_code.id,
        ).exclude(pk=diagnosis.pk).exists()
        if duplicate:
            return Response(
                {'detail': 'This patient already has that ICD-10 code on this visit.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_code = diagnosis.icd10_code
        if diagnosis.original_icd10_code_id is None:
            diagnosis.original_icd10_code = old_code

        diagnosis.icd10_code = new_code
        diagnosis.corrected_by = request.user
        diagnosis.corrected_at = timezone.now()
        diagnosis.correction_reason = reason
        diagnosis.correction_notes = notes

        try:
            diagnosis.save(
                update_fields=[
                    'icd10_code',
                    'original_icd10_code',
                    'corrected_by',
                    'corrected_at',
                    'correction_reason',
                    'correction_notes',
                ]
            )
        except IntegrityError:
            return Response(
                {'detail': 'This patient already has that ICD-10 code on this visit.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        AuditService.log_activity(
            user=request.user,
            action='update',
            object_type='diagnosis',
            object_id=str(diagnosis.id),
            module='consultation',
            object_repr=f'Diagnosis corrected to {new_code.code}',
            description=(
                f'Records corrected diagnosis for {diagnosis.patient.get_full_name()} '
                f'from {old_code.code} to {new_code.code}'
            ),
            old_values={
                'icd10_code': old_code.code,
                'icd10_description': old_code.description,
            },
            new_values={
                'icd10_code': new_code.code,
                'icd10_description': new_code.description,
                'correction_reason': reason,
                'correction_notes': notes,
            },
            request=request,
        )

        return Response(self.get_serializer(diagnosis).data)

    def perform_create(self, serializer):
        """Create diagnosis and log audit."""
        diagnosis = serializer.save(diagnosed_by=self.request.user)
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='diagnosis',
            object_id=str(diagnosis.id),
            module='consultation',
            object_repr=f'Diagnosis {diagnosis.icd10_code.code if diagnosis.icd10_code else "Unknown"}',
            description=f'Created diagnosis {diagnosis.icd10_code.code if diagnosis.icd10_code else "Unknown"} for patient {diagnosis.patient.get_full_name()}',
            new_values={'icd10_code': diagnosis.icd10_code.code if diagnosis.icd10_code else '', 'status': diagnosis.status, 'certainty': diagnosis.certainty},
            request=self.request,
        )

    def perform_update(self, serializer):
        diagnosis = self.get_object()
        old_code = diagnosis.icd10_code.code if diagnosis.icd10_code else ''
        updated = serializer.save()
        new_code = updated.icd10_code.code if updated.icd10_code else ''
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='diagnosis',
            object_id=str(updated.id),
            module='consultation',
            object_repr=f'Diagnosis {new_code or "Unknown"}',
            description=f'Updated diagnosis for patient {updated.patient.get_full_name()}',
            old_values={'icd10_code': old_code, 'status': diagnosis.status, 'certainty': diagnosis.certainty},
            new_values={'icd10_code': new_code, 'status': updated.status, 'certainty': updated.certainty},
            request=self.request,
        )

    def perform_destroy(self, instance):
        code = instance.icd10_code.code if instance.icd10_code else 'Unknown'
        patient_name = instance.patient.get_full_name()
        diagnosis_id = str(instance.id)
        instance.delete()
        AuditService.log_activity(
            user=self.request.user,
            action='delete',
            object_type='diagnosis',
            object_id=diagnosis_id,
            module='consultation',
            object_repr=f'Diagnosis {code}',
            description=f'Deleted diagnosis {code} for patient {patient_name}',
            old_values={'icd10_code': code},
            request=self.request,
        )


@document_viewset(tag="Consultation", resource="presenting complaint categories", read_only=True)
class PresentingComplaintCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """Reference library: complaint categories (optional nested complaints via query params)."""
    serializer_class = PresentingComplaintCategorySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name']
    ordering_fields = ['sort_order', 'name', 'created_at']
    ordering = ['sort_order', 'name']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return PresentingComplaintCategory.objects.none()
        
        return (
            PresentingComplaintCategory.objects.annotate(
                complaint_count=Count('complaints', distinct=True),
                active_complaint_count=Count(
                    'complaints',
                    filter=Q(complaints__is_active=True),
                    distinct=True,
                ),
            )
            .prefetch_related('complaints')
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        qp = self.request.query_params
        ctx['include_complaints'] = qp.get('include_complaints', '').lower() in ('1', 'true', 'yes')
        ctx['active_only'] = qp.get('active_only', 'true').lower() not in ('0', 'false', 'no')
        return ctx


@document_viewset(tag="Consultation", resource="presenting complaints", read_only=True)
class PresentingComplaintViewSet(viewsets.ReadOnlyModelViewSet):
    """Reference library: presenting complaint options."""
    serializer_class = PresentingComplaintSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['label', 'normalized_label']
    ordering_fields = ['sort_order', 'label', 'created_at']
    ordering = ['category__sort_order', 'category__name', 'sort_order', 'label']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return PresentingComplaint.objects.none()
        
        return PresentingComplaint.objects.select_related('category')
