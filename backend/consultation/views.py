from __future__ import annotations

import logging
from typing import Optional

from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.db.models import Count, Max, Q
from django.http import Http404, HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from django.utils.dateparse import parse_date
from laboratory.pagination import FlexiblePageNumberPagination

logger = logging.getLogger(__name__)

from .models import (
    ConsultationRoom,
    ConsultationSession,
    ConsultationQueue,
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
    ReferralSerializer,
    ReferralFacilitySerializer,
    ResponsibilityFormIssuanceSerializer,
    DiagnosisSerializer,
    ICD10CodeSerializer,
    PresentingComplaintCategorySerializer,
    PresentingComplaintSerializer,
)
from audit.services import AuditService
from patients.workflow import close_visit_workflow, finalize_consultation_artifacts_for_visit
from common.mixins import ClinicScopedMixin
from accounts.utils import resolve_clinic_id
from organization.models import SystemConfig


class ReferralFacilityViewSet(viewsets.ModelViewSet):
    """CRUD for the referral-facility catalog (typeahead + Django admin)."""

    permission_classes = [IsAuthenticated]
    serializer_class = ReferralFacilitySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active", "facility_type"]
    search_fields = ["name", "code", "email", "address", "specialties"]
    ordering_fields = ["sort_order", "name", "created_at"]
    ordering = ["sort_order", "name"]
    # Small catalog: return a plain JSON array (avoids pagination quirks).
    pagination_class = None

    def get_queryset(self):
        return ReferralFacility.objects.all()


class ConsultationRoomViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing consultation rooms."""
    
    clinic_filter_field = 'clinic'
    permission_classes = [IsAuthenticated]
    serializer_class = ConsultationRoomSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'specialty', 'is_active', 'clinic', 'room_type']
    search_fields = ['name', 'room_number', 'location']
    ordering_fields = ['room_number', 'name']
    ordering = ['room_number']
    
    def get_queryset(self):
        # Admin listing must include inactive / maintenance rows so filters work.
        # Use ``is_active`` / ``status`` query params to narrow results.
        return self.scope_queryset(
            ConsultationRoom.objects.all().select_related('clinic')
        )
    
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


class ConsultationSessionViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing consultation sessions."""
    
    permission_classes = [IsAuthenticated]
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
        qs = ConsultationSession.objects.all().select_related('room', 'patient', 'doctor', 'visit', 'created_by')

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
            existing_session = self._sync_resumed_session_room_to_request(existing_session, data)
            payload = self.get_serializer(existing_session).data
            payload['resumed'] = True
            return Response(payload, status=status.HTTP_200_OK)

        doctor = data.get('doctor') or self._find_doctor_for_session(data)
        save_kwargs = {'created_by': request.user}
        if doctor:
            save_kwargs['doctor'] = doctor

        self.auto_set_clinic(serializer)

        try:
            with transaction.atomic():
                session = serializer.save(**save_kwargs)
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

            if vref and vref.status != "completed":
                old_vs = vref.status
                vref.status = "completed"
                vref.save(update_fields=["status"])
                AuditService.log_activity(
                    user=self.request.user,
                    action="update",
                    object_type="visit",
                    object_id=str(vref.id),
                    module="consultation",
                    object_repr=f"Visit {vref.visit_id}",
                    description=f"Marked visit {vref.visit_id} as completed after consultation status update",
                    old_values={"status": old_vs},
                    new_values={"status": "completed"},
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

        # Update visit status to 'completed' if visit exists
        if session.visit:
            visit = session.visit
            old_visit_status = visit.status
            visit.status = 'completed'
            visit.save()
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='visit',
                object_id=str(visit.id),
                module='consultation',
                object_repr=f'Visit {visit.visit_id}',
                description=f'Marked visit {visit.visit_id} as completed after consultation session ended',
                old_values={'status': old_visit_status},
                new_values={'status': 'completed'},
                request=self.request,
            )
            fin = finalize_consultation_artifacts_for_visit(visit, session_terminal_status="completed")
            if fin["sessions_updated"] or fin["queue_items_deactivated"]:
                AuditService.log_activity(
                    user=self.request.user,
                    action='update',
                    object_type='visit',
                    object_id=str(visit.id),
                    module='consultation',
                    object_repr=f'Visit {visit.visit_id}',
                    description=f'Closed sibling open sessions/queue after primary session end: {fin}',
                    old_values={'status': 'completed'},
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

        start_date, end_date = dates

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

        return Response(analytics)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get consultation statistics for dashboard."""
        from django.db.models import Count, Q, Avg, Sum
        from datetime import timedelta
        from django.utils import timezone as tz
        
        now = tz.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=7)
        month_start = today_start.replace(day=1)
        
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

    @action(detail=True, methods=['get'], url_path='report')
    def download_report(self, request, pk=None):
        """Download consultation report as PDF."""
        session = self.get_object()
        from .report_pdf import build_consultation_report_pdf
        return build_consultation_report_pdf(session)


class ConsultationQueueViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing consultation queue."""
    
    clinic_filter_field = 'room__clinic'
    permission_classes = [IsAuthenticated]
    serializer_class = ConsultationQueueSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['room', 'patient', 'is_active', 'visit']
    ordering_fields = ['priority', 'queued_at', 'called_at']
    ordering = ['priority', 'queued_at']
    
    def get_queryset(self):
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
        
        # If this visit has multiple clinics, create queue entries for ALL matching clinic rooms
        if visit and hasattr(visit, 'clinics') and visit.clinics and len(visit.clinics) > 1:
            # Get all clinics for this visit
            visit_clinics = visit.clinics
            
            # Check if Physiotherapy is one of the clinics
            has_physio = any('physiotherapy' in clinic.lower() for clinic in visit_clinics)
            
            # Create physiotherapy order if needed
            if has_physio:
                try:
                    from physiotherapy.models import PhysioOrder
                    
                    # Check if physio order already exists for this visit
                    physio_order_exists = PhysioOrder.objects.filter(
                        patient=patient,
                        visit=visit,
                        status__in=['pending', 'scheduled', 'in_progress']
                    ).exists()
                    
                    if not physio_order_exists:
                        # Create physio order automatically
                        PhysioOrder.objects.create(
                            patient=patient,
                            ordered_by=self.request.user,
                            visit=visit,  # Link to the visit
                            consultation_session=None,
                            diagnosis='',
                            chief_complaint=f'Multi-clinic visit: {", ".join(visit_clinics)}',
                            treatment_goal='',
                            special_instructions='Automatically created from multi-clinic visit',
                            priority='routine',
                            status='scheduled',
                            scheduled_at=timezone.now(),
                            sessions_completed=0,
                        )
                        logger.info(f'Created automatic physio order for patient {patient} from multi-clinic visit')
                except Exception as e:
                    logger.error(f'Failed to create physio order: {e}')
            
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
                        # Create eye order automatically
                        EyeOrder.objects.create(
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
                        logger.info(f'Created automatic eye order for patient {patient} from multi-clinic visit')
                except Exception as e:
                    logger.error(f'Failed to create eye order: {e}')
            
            # Find all active consultation rooms for NON-physio clinics
            non_physio_clinics = [c for c in visit_clinics if 'physiotherapy' not in c.lower()]
            
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
                                priority=queue_item.priority,
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
            description=f'Added {queue_item.patient.get_full_name()} to consultation queue for {queue_item.room.name}',
            new_values={
                'room': queue_item.room.name,
                'patient': queue_item.patient.get_full_name(),
                'priority': queue_item.priority,
                'visit': str(queue_item.visit.id) if queue_item.visit else None,
            },
            request=self.request,
        )

        # Notify doctors (Nursing -> Consultation)
        try:
            from notifications.services import NotificationService

            patient_name = queue_item.patient.get_full_name()
            room_name = queue_item.room.name
            title = "Patient sent to Consultation"
            message = f"{patient_name} has been sent to {room_name} for consultation."

            # A patient is now waiting in the queue for this room — that
            # outranks routine background pings.
            NotificationService.notify_role(
                role_name='Medical Doctor',
                title=title,
                message=message,
                notification_type='workflow',
                priority='high',
                action_url=f"/consultation/room/{queue_item.room.id}",
                object_type='consultation_queue',
                object_id=str(queue_item.id),
                clinic_id=getattr(self.request.user, 'clinic_id', None),
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
                description=f'Queue item reassigned from {old_room.name} to {updated.room.name}',
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

        # If room changed, notify doctors again (reassignment).
        try:
            if old_room.id != updated.room.id:
                from notifications.services import NotificationService

                patient_name = updated.patient.get_full_name()
                title = "Patient reassigned to Consultation room"
                message = f"{patient_name} has been reassigned to {updated.room.name}."

                # Reassignment also means a patient is now in this
                # room's queue waiting — same priority as initial send.
                NotificationService.notify_role(
                    role_name='Medical Doctor',
                    title=title,
                    message=message,
                    notification_type='workflow',
                    priority='high',
                    action_url=f"/consultation/room/{updated.room.id}",
                    object_type='consultation_queue',
                    object_id=str(updated.id),
                    clinic_id=getattr(self.request.user, 'clinic_id', None),
                )
        except Exception:
            pass
    
    @action(detail=True, methods=['post'])
    def call(self, request, pk=None):
        """Call a patient from the queue."""
        queue_item = self.get_object()
        queue_item.called_at = timezone.now()
        queue_item.is_active = False
        queue_item.save()
        return Response(ConsultationQueueSerializer(queue_item).data)

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


class ReferralViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing referrals."""

    permission_classes = [IsAuthenticated]
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
        qs = (
            Referral.objects.all()
            .select_related(
                "patient",
                "visit",
                "session",
                "referred_by",
                "created_by",
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

    @action(detail=True, methods=["post"])
    def submit_to_records(self, request, pk=None):
        """Move a draft referral into the Medical Records queue."""
        referral = self.get_object()
        if referral.status != "draft":
            return Response(
                {"detail": "Only draft referrals can be submitted to Medical Records."},
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


class ICD10CodeViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for ICD-10 codes (read-only reference data)."""

    permission_classes = [IsAuthenticated]  # Keep authentication for consistency
    serializer_class = ICD10CodeSerializer
    pagination_class = FlexiblePageNumberPagination  # Allow large page sizes for ICD-10 codes
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['code', 'description', 'category']
    ordering_fields = ['code', 'description']
    ordering = ['code']
    page_size = 5000  # Override default page size for this viewset

    def get_queryset(self):
        return ICD10Code.objects.filter(is_active=True)


class DiagnosisViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing patient diagnoses."""

    clinic_filter_field = 'visit__location_clinic'
    permission_classes = [IsAuthenticated]
    serializer_class = DiagnosisSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'visit', 'session', 'icd10_code', 'status', 'certainty']
    search_fields = ['diagnosis_text', 'icd10_code__code', 'icd10_code__description']
    ordering_fields = ['diagnosed_at', 'status']
    ordering = ['-diagnosed_at']

    def get_queryset(self):
        return self.scope_queryset(
            Diagnosis.objects.all().select_related('patient', 'visit', 'session', 'icd10_code', 'diagnosed_by')
        )

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


class PresentingComplaintCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """Reference library: complaint categories (optional nested complaints via query params)."""

    permission_classes = [IsAuthenticated]
    serializer_class = PresentingComplaintCategorySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name']
    ordering_fields = ['sort_order', 'name', 'created_at']
    ordering = ['sort_order', 'name']

    def get_queryset(self):
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


class PresentingComplaintViewSet(viewsets.ReadOnlyModelViewSet):
    """Reference library: presenting complaint options."""

    permission_classes = [IsAuthenticated]
    serializer_class = PresentingComplaintSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['label', 'normalized_label']
    ordering_fields = ['sort_order', 'label', 'created_at']
    ordering = ['category__sort_order', 'category__name', 'sort_order', 'label']

    def get_queryset(self):
        return PresentingComplaint.objects.select_related('category')
