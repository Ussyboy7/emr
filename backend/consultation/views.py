"""
Views for the Consultation app.
"""
import logging
from datetime import date
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import BasePermission
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from django.db import transaction
from django.db import IntegrityError
from django.db.models import Prefetch, Count, Q
from laboratory.pagination import FlexiblePageNumberPagination

logger = logging.getLogger(__name__)

from .models import (
    ConsultationRoom,
    ConsultationSession,
    ConsultationQueue,
    Referral,
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
    ReferralSerializer,
    ResponsibilityFormIssuanceSerializer,
    DiagnosisSerializer,
    ICD10CodeSerializer,
    PresentingComplaintCategorySerializer,
    PresentingComplaintSerializer,
)
from audit.services import AuditService


def _parse_ymd_for_responsibility_form(value):
    """Parse valid_from / valid_to from JSON: YYYY-MM-DD or ISO datetime (date prefix)."""
    from django.utils.dateparse import parse_date

    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        head = s[:10]
        if len(head) == 10:
            d = parse_date(head)
            if d is not None:
                return d
    return parse_date(s)


class IsComplaintLibraryManager(BasePermission):
    """
    Allow write access for administrative users who can manage reference libraries.
    Read is handled by IsAuthenticated at viewset level.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
            return True
        return getattr(user, 'system_role', '') in {'System Administrator', 'Admin Staff'}


class ConsultationRoomViewSet(viewsets.ModelViewSet):
    """ViewSet for managing consultation rooms."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ConsultationRoomSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'specialty', 'is_active', 'clinic']
    search_fields = ['name', 'room_number', 'location']
    ordering_fields = ['room_number', 'name']
    ordering = ['room_number']
    
    def get_queryset(self):
        return ConsultationRoom.objects.filter(is_active=True).select_related('clinic')
    
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


class ConsultationSessionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing consultation sessions."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ConsultationSessionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['room', 'patient', 'doctor', 'status', 'visit']
    search_fields = ['session_id', 'notes', 'patient__first_name', 'patient__surname', 'patient__patient_id']
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

        return qs
    
    def _resolve_open_session_for_create(self, data):
        """
        Return existing open session (active or paused) that should be resumed.
        Priority:
        1) same visit (strict)
        2) same patient+room (fallback when visit is absent)
        """
        visit = data.get('visit')
        if visit:
            existing = (
                ConsultationSession.objects
                .filter(visit=visit, status__in=['active', 'paused'])
                .order_by('-started_at')
                .first()
            )
            if existing:
                return existing

        patient = data.get('patient')
        room = data.get('room')
        if patient and room:
            return (
                ConsultationSession.objects
                .filter(patient=patient, room=room, status__in=['active', 'paused'])
                .order_by('-started_at')
                .first()
            )
        return None

    def _activate_paused_session(self, session):
        if session.status != 'paused':
            return session
        now = timezone.now()
        session.status = 'active'
        session.last_resumed_at = now
        session.paused_at = None
        session.save(update_fields=['status', 'last_resumed_at', 'paused_at'])
        return session

    def _pause_active_session(self, session):
        if session.status != 'active':
            return session
        now = timezone.now()
        elapsed = 0
        if session.last_resumed_at:
            elapsed = max(0, int((now - session.last_resumed_at).total_seconds()))
        session.active_seconds = int(session.active_seconds or 0) + elapsed
        session.status = 'paused'
        session.paused_at = now
        session.last_resumed_at = None
        session.save(update_fields=['active_seconds', 'status', 'paused_at', 'last_resumed_at'])
        return session

    def _prepare_session_create_data(self, validated_data):
        data = validated_data.copy()
        if 'doctor' not in data or data['doctor'] is None:
            doctor = self._find_doctor_for_session(data)
            if doctor:
                data['doctor'] = doctor
        return data

    def _log_session_create(self, session):
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='consultation_session',
            object_id=str(session.id),
            module='consultation',
            object_repr=f'Session {session.session_id}',
            description=f'Started consultation session {session.session_id} for patient {session.patient.get_full_name()}',
            new_values={'session_id': session.session_id, 'status': session.status, 'room': str(session.room.id) if session.room else ''},
            request=self.request,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = self._prepare_session_create_data(serializer.validated_data)

        # Idempotent create: resume existing open session instead of creating duplicates.
        existing = self._resolve_open_session_for_create(data)
        if existing:
            existing = self._activate_paused_session(existing)
            payload = self.get_serializer(existing).data
            payload['resumed'] = True
            return Response(payload, status=status.HTTP_200_OK)

        try:
            session = serializer.save(created_by=self.request.user, **data)
        except IntegrityError:
            # Handle race conditions against DB-level unique constraints by returning the now-existing session.
            existing_after_race = self._resolve_open_session_for_create(data)
            if existing_after_race:
                existing_after_race = self._activate_paused_session(existing_after_race)
                payload = self.get_serializer(existing_after_race).data
                payload['resumed'] = True
                return Response(payload, status=status.HTTP_200_OK)
            raise

        self._log_session_create(session)
        headers = self.get_success_headers(serializer.data)
        payload = self.get_serializer(session).data
        payload['resumed'] = False
        return Response(payload, status=status.HTTP_201_CREATED, headers=headers)

    def _find_doctor_for_session(self, data):
        """Find appropriate doctor for consultation session using multiple strategies."""
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
    def pause(self, request, pk=None):
        """Pause an active consultation session."""
        session = self.get_object()
        if session.status == 'paused':
            return Response(ConsultationSessionSerializer(session).data)
        if session.status != 'active':
            return Response(
                {'detail': 'Only active sessions can be paused.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = session.status
        self._pause_active_session(session)
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='consultation_session',
            object_id=str(session.id),
            module='consultation',
            object_repr=f'Session {session.session_id}',
            description=f'Paused consultation session {session.session_id}',
            old_values={'status': old_status},
            new_values={'status': session.status, 'paused_at': str(session.paused_at)},
            request=self.request,
        )
        return Response(ConsultationSessionSerializer(session).data)

    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        """Resume a paused consultation session."""
        session = self.get_object()
        if session.status == 'active':
            return Response(ConsultationSessionSerializer(session).data)
        if session.status != 'paused':
            return Response(
                {'detail': 'Only paused sessions can be resumed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = session.status
        self._activate_paused_session(session)
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

    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        """End a consultation session and log audit."""
        from patients.models import Visit
        
        session = self.get_object()
        old_status = session.status
        if session.status == 'active':
            self._pause_active_session(session)
        session.status = 'completed'
        session.ended_at = timezone.now()
        session.paused_at = None
        session.last_resumed_at = None
        session.save(update_fields=['status', 'ended_at', 'paused_at', 'last_resumed_at'])
        
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
                duration = session.get_active_duration_seconds() / 60
                if duration > 0:
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
            duration = round(session.get_active_duration_seconds() / 60, 0)
            
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
        queue_count = ConsultationQueue.objects.filter(is_active=True).count()
        
        # Referrals stats
        pending_referrals = Referral.objects.filter(status__in=['draft', 'sent']).count()
        
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


class ConsultationQueueViewSet(viewsets.ModelViewSet):
    """ViewSet for managing consultation queue."""
    
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

        return qs
    
    def perform_create(self, serializer):
        """Create queue item(s) with duplicate prevention.
        
        For multi-clinic visits, create queue entries for all matching clinic rooms.
        """
        from django.db import IntegrityError
        from organization.models import Clinic
        
        # Check if patient is already in queue for this room (active)
        room = serializer.validated_data.get('room')
        patient = serializer.validated_data.get('patient')
        visit = serializer.validated_data.get('visit')
        
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

            NotificationService.notify_role(
                role_name='Medical Doctor',  # For now: notify all doctors
                title=title,
                message=message,
                notification_type='workflow',
                priority='normal',
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

                NotificationService.notify_role(
                    role_name='Medical Doctor',
                    title=title,
                    message=message,
                    notification_type='workflow',
                    priority='normal',
                    action_url=f"/consultation/room/{updated.room.id}",
                    object_type='consultation_queue',
                    object_id=str(updated.id),
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


class ReferralViewSet(viewsets.ModelViewSet):
    """ViewSet for managing referrals."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ReferralSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'visit', 'session', 'referred_by', 'specialty', 'facility', 'status', 'urgency']
    search_fields = ['referral_id', 'specialty', 'facility', 'reason', 'clinical_summary']
    ordering_fields = ['referred_at', 'urgency']
    ordering = ['-referred_at']

    def _expire_old_forms(self, referral=None):
        """Auto-expire active responsibility forms past validity date."""
        qs = ResponsibilityFormIssuance.objects.filter(status='active', valid_to__lt=date.today())
        if referral is not None:
            qs = qs.filter(referral=referral)
        qs.update(status='expired')
    
    def get_queryset(self):
        self._expire_old_forms()
        qs = Referral.objects.all().select_related(
            'patient',
            'patient__principal_staff',
            'visit',
            'session',
            'referred_by',
            'created_by',
            'referral_letter_acknowledged_by',
        ).prefetch_related(
            Prefetch(
                'responsibility_forms',
                queryset=ResponsibilityFormIssuance.objects.select_related(
                    'issued_by', 'records_acknowledged_by'
                ).order_by('-issue_date'),
            ),
        )

        # Date filtering for referrals list pages
        date = self.request.query_params.get('date')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if date:
            qs = qs.filter(referred_at__date=date)
        elif start_date:
            qs = qs.filter(referred_at__date__gte=start_date)
            if end_date:
                qs = qs.filter(referred_at__date__lte=end_date)
        elif end_date:
            qs = qs.filter(referred_at__date__lte=end_date)

        if self.action == 'list':
            exclude_draft = str(self.request.query_params.get('exclude_draft', '')).lower()
            if exclude_draft in ('1', 'true', 'yes'):
                qs = qs.exclude(status='draft')
            exclude_status = str(self.request.query_params.get('exclude_status', '')).strip()
            if exclude_status:
                # Comma-separated status values to exclude (e.g. "returned_for_correction")
                statuses = [s.strip() for s in exclude_status.split(',') if s.strip()]
                if statuses:
                    qs = qs.exclude(status__in=statuses)
        return qs

    def retrieve(self, request, *args, **kwargs):
        """If every issuance is stamped but status is still queue/review, fix it (e.g. stale prefetch during stamp)."""
        instance = self.get_object()
        is_super = getattr(request.user, 'is_superuser', False)
        if self._is_records_officer(request.user) or is_super:
            self._apply_approved_for_forms_when_all_stamped(instance, request, audit_manual=False)
            instance.refresh_from_db()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def _is_records_officer(self, user):
        role = getattr(user, 'system_role', '') or ''
        return role in ['Medical Records Officer', 'System Administrator']

    def _is_referring_owner(self, user, referral):
        uid = getattr(user, 'id', None)
        if uid is None:
            return False
        return referral.referred_by_id == uid or referral.created_by_id == uid

    def _all_responsibility_forms_have_records_stamp(self, referral_id):
        """Fresh DB check — avoids stale prefetch on Referral.responsibility_forms after a stamp save."""
        qs = ResponsibilityFormIssuance.objects.filter(referral_id=referral_id)
        if not qs.exists():
            return False
        return not qs.filter(records_acknowledged_at__isnull=True).exists()

    def _apply_approved_for_forms_when_all_stamped(self, referral, request, *, audit_manual=False):
        """If status is queue/review and every issuance has records_acknowledged_at, set approved_for_forms."""
        if referral.status not in ('submitted_to_records', 'records_review'):
            return referral
        if not self._all_responsibility_forms_have_records_stamp(referral.pk):
            return referral
        referral.status = 'approved_for_forms'
        referral.approved_at = timezone.now()
        referral.save(update_fields=['status', 'approved_at'])
        desc = (
            f'Approved referral {referral.referral_id} for responsibility forms (all stamps recorded)'
            if audit_manual
            else f'Auto-approved referral {referral.referral_id} (all responsibility stamps recorded)'
        )
        try:
            AuditService.log_activity(
                user=request.user,
                action='approve',
                object_type='referral',
                object_id=str(referral.id),
                module='consultation',
                object_repr=f'Referral {referral.referral_id}',
                description=desc,
                new_values={'status': referral.status},
                request=request,
            )
        except Exception:
            pass
        return referral

    _CLINICIAN_NON_EDITABLE_FIELDS = frozenset(
        {'patient', 'visit', 'session', 'status', 'referral_id', 'referred_at', 'created_by', 'referred_by'}
    )

    def partial_update(self, request, *args, **kwargs):
        """Restrict status updates to records; clinicians may edit content only on draft/returned."""
        referral = self.get_object()
        user = request.user
        is_records = self._is_records_officer(user)
        is_super = getattr(user, 'is_superuser', False)

        if 'status' in request.data and request.data.get('status') is not None:
            if not is_records and not is_super:
                return Response(
                    {'detail': 'Only Medical Records can update referral status directly.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if not is_records and not is_super:
            if referral.status not in ('draft', 'returned_for_correction'):
                return Response(
                    {'detail': 'Only draft or returned-for-correction referrals can be edited.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            uid = user.id
            if referral.referred_by_id != uid and referral.created_by_id != uid:
                return Response(
                    {'detail': 'You can only edit referrals you created or referred.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            for key in request.data.keys():
                if key in self._CLINICIAN_NON_EDITABLE_FIELDS:
                    return Response(
                        {'detail': f'Cannot update field "{key}" from this role.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )

        response = super().partial_update(request, *args, **kwargs)
        try:
            ref = self.get_object()
            AuditService.log_activity(
                user=request.user,
                action='update',
                object_type='referral',
                object_id=str(ref.id),
                module='consultation',
                object_repr=f'Referral {ref.referral_id}',
                description=f'Updated referral {ref.referral_id}',
                new_values={'status': ref.status},
                request=request,
            )
        except Exception:
            pass
        return response

    def destroy(self, request, *args, **kwargs):
        referral = self.get_object()
        user = request.user
        is_records = self._is_records_officer(user)
        is_super = getattr(user, 'is_superuser', False)
        if not is_records and not is_super:
            if referral.status != 'draft':
                return Response(
                    {'detail': 'Only draft referrals can be deleted.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not self._is_referring_owner(user, referral):
                return Response(
                    {'detail': 'You can only delete draft referrals you created or referred.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return super().destroy(request, *args, **kwargs)
    
    def perform_create(self, serializer):
        """Create referral and log audit. Clinicians always start as draft until they submit to records."""
        user = self.request.user
        save_kwargs = {'created_by': user, 'referred_by': user}
        if not self._is_records_officer(user) and not getattr(user, 'is_superuser', False):
            save_kwargs['status'] = 'draft'
            save_kwargs['submitted_at'] = None
        referral = serializer.save(**save_kwargs)
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='referral',
            object_id=str(referral.id),
            module='consultation',
            object_repr=f'Referral {referral.referral_id}',
            description=f'Created referral {referral.referral_id} to {referral.specialty} at {referral.facility}',
            new_values={'referral_id': referral.referral_id, 'specialty': referral.specialty, 'facility': referral.facility, 'urgency': referral.urgency},
            request=self.request,
        )

    @action(detail=True, methods=['post'])
    def submit_to_records(self, request, pk=None):
        referral = self.get_object()
        is_records = self._is_records_officer(request.user)
        is_super = getattr(request.user, 'is_superuser', False)
        if not is_records and not is_super:
            if not self._is_referring_owner(request.user, referral):
                return Response(
                    {'detail': 'Only the referring clinician can submit this referral to Medical Records.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        if referral.status not in ['draft', 'returned_for_correction']:
            return Response({'detail': 'Only draft/returned referrals can be submitted.'}, status=status.HTTP_400_BAD_REQUEST)
        if not referral.responsibility_forms.exists():
            return Response(
                {
                    'detail': (
                        'Issue at least one responsibility form before sending this referral to Medical Records '
                        'for acknowledgement.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        referral.status = 'submitted_to_records'
        referral.submitted_at = timezone.now()
        referral.save(update_fields=['status', 'submitted_at'])
        try:
            AuditService.log_activity(
                user=request.user,
                action='submit',
                object_type='referral',
                object_id=str(referral.id),
                module='consultation',
                object_repr=f'Referral {referral.referral_id}',
                description=f'Submitted referral {referral.referral_id} to Medical Records',
                new_values={'status': referral.status},
                request=request,
            )
        except Exception:
            pass
        return Response(ReferralSerializer(referral).data)

    @action(detail=True, methods=['post'])
    def return_for_correction(self, request, pk=None):
        referral = self.get_object()
        is_owner = self._is_referring_owner(request.user, referral)
        is_super = getattr(request.user, 'is_superuser', False)
        if not (is_owner or is_super):
            return Response(
                {'detail': 'Only the referring clinician can return this referral for correction.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if referral.status not in ('submitted_to_records', 'records_review', 'approved_for_forms'):
            return Response(
                {'detail': 'Referral cannot be sent back for correction from its current status.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        referral.status = 'returned_for_correction'
        note = request.data.get('notes')
        if note:
            referral.notes = note
        referral.reviewed_at = timezone.now()
        referral.save(update_fields=['status', 'notes', 'reviewed_at'])
        try:
            AuditService.log_activity(
                user=request.user,
                action='update',
                object_type='referral',
                object_id=str(referral.id),
                module='consultation',
                object_repr=f'Referral {referral.referral_id}',
                description=f'Returned referral {referral.referral_id} for correction',
                new_values={'status': referral.status, 'notes': referral.notes},
                request=request,
            )
        except Exception:
            pass
        return Response(ReferralSerializer(referral).data)

    def acknowledge_responsibility_form(self, request, pk=None):
        """Medical Records: confirm a specific responsibility form issuance was physically stamped. (URL: see consultation.urls)"""
        if not self._is_records_officer(request.user):
            return Response(
                {'detail': 'Only Medical Records can acknowledge responsibility forms.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        referral = self.get_object()
        if referral.status in ('draft', 'closed', 'cancelled'):
            return Response(
                {'detail': 'Cannot acknowledge forms for this referral status.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        form_id = request.data.get('form_id')
        if form_id is None or str(form_id).strip() == '':
            return Response({'detail': 'form_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            form = referral.responsibility_forms.get(id=int(form_id))
        except (ValueError, TypeError, ResponsibilityFormIssuance.DoesNotExist):
            return Response({'detail': 'Form not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not form.records_acknowledged_at:
            form.records_acknowledged_at = timezone.now()
            form.records_acknowledged_by = request.user
            form.save(update_fields=['records_acknowledged_at', 'records_acknowledged_by', 'updated_at'])
            try:
                AuditService.log_activity(
                    user=request.user,
                    action='update',
                    object_type='responsibility_form',
                    object_id=str(form.id),
                    module='consultation',
                    object_repr=f'{referral.referral_id} Form #{form.sequence_number}',
                    description=(
                        f'Acknowledged responsibility form #{form.sequence_number} (stamp) for {referral.referral_id}'
                    ),
                    request=request,
                )
            except Exception:
                pass
        referral.refresh_from_db()
        self._apply_approved_for_forms_when_all_stamped(referral, request, audit_manual=False)
        return Response(ResponsibilityFormIssuanceSerializer(form).data)

    @action(detail=True, methods=['post'])
    def approve_for_forms(self, request, pk=None):
        """Mark referral approved for ongoing responsibility-form workflow after all stamps are recorded."""
        if not self._is_records_officer(request.user):
            return Response({'detail': 'Only Medical Records can approve referrals.'}, status=status.HTTP_403_FORBIDDEN)
        referral = self.get_object()
        if referral.status not in ('submitted_to_records', 'records_review'):
            return Response(
                {'detail': 'Referral must be submitted to records (or in review) before approval for forms.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not ResponsibilityFormIssuance.objects.filter(referral_id=referral.pk).exists():
            return Response(
                {'detail': 'No responsibility forms exist; issue at least one before approving.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ResponsibilityFormIssuance.objects.filter(
            referral_id=referral.pk, records_acknowledged_at__isnull=True
        ).exists():
            return Response(
                {
                    'detail': (
                        'Acknowledge each responsibility form (physical stamp) before Records acknowledged status. '
                        'Use the per-form Acknowledge action in the records queue.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        self._apply_approved_for_forms_when_all_stamped(referral, request, audit_manual=True)
        referral.refresh_from_db()
        return Response(ReferralSerializer(referral).data)

    @action(detail=True, methods=['post'])
    def close_referral(self, request, pk=None):
        if not self._is_records_officer(request.user):
            return Response({'detail': 'Only Medical Records can close referrals.'}, status=status.HTTP_403_FORBIDDEN)
        referral = self.get_object()
        referral.status = 'closed'
        referral.closed_at = timezone.now()
        referral.save(update_fields=['status', 'closed_at'])
        try:
            AuditService.log_activity(
                user=request.user,
                action='close',
                object_type='referral',
                object_id=str(referral.id),
                module='consultation',
                object_repr=f'Referral {referral.referral_id}',
                description=f'Closed referral {referral.referral_id}',
                new_values={'status': referral.status},
                request=request,
            )
        except Exception:
            pass
        return Response(ReferralSerializer(referral).data)

    @action(detail=True, methods=['get', 'post'])
    def forms(self, request, pk=None):
        """List or create responsibility form issuances for a referral."""
        referral = self.get_object()
        self._expire_old_forms(referral=referral)
        if request.method == 'GET':
            forms = referral.responsibility_forms.all().order_by('-issue_date')
            return Response(ResponsibilityFormIssuanceSerializer(forms, many=True).data)

        # POST: referring clinician (owner) or superuser only — not Medical Records (issuance is a clinical step).
        user = request.user
        is_owner = self._is_referring_owner(user, referral)
        is_super = getattr(user, 'is_superuser', False)

        if referral.status in ('closed', 'cancelled'):
            return Response(
                {'detail': 'Cannot issue responsibility forms on a closed or cancelled referral.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (is_owner or is_super):
            return Response(
                {'detail': 'Only the referring clinician can issue responsibility forms for this referral.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        valid_from = request.data.get('valid_from')
        valid_to = request.data.get('valid_to')
        notes = request.data.get('notes', '')
        if not valid_from or not valid_to:
            return Response({'detail': 'valid_from and valid_to are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            vf = _parse_ymd_for_responsibility_form(valid_from)
            vt = _parse_ymd_for_responsibility_form(valid_to)
            if vf is None or vt is None:
                return Response(
                    {'detail': 'valid_from and valid_to must be valid dates (YYYY-MM-DD).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Exception:
            return Response(
                {'detail': 'Could not read valid_from / valid_to dates.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if vf > vt:
            return Response(
                {'detail': 'valid_from must be on or before valid_to.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        override_active = str(request.data.get('override_active', '')).lower() in ['1', 'true', 'yes']
        override_reason = request.data.get('override_reason', '')
        # Only block (or require override) when the new window overlaps a still-current active form.
        # Sequential months (e.g. Mar then Apr) do not overlap and do not need override.
        active_current = referral.responsibility_forms.filter(status='active', valid_to__gte=date.today())
        overlaps_active = False
        for ex in active_current:
            if not (vt < ex.valid_from or vf > ex.valid_to):
                overlaps_active = True
                break
        if overlaps_active and not override_active:
            return Response(
                {
                    'detail': (
                        'These dates overlap an active responsibility form. Use different dates, or pass '
                        'override_active=true with override_reason (e.g. correction or duplicate month).'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if overlaps_active and override_active and not str(override_reason).strip():
            return Response(
                {'detail': 'override_reason is required when overriding an overlapping active form.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Lock referral row so concurrent issuances cannot claim the same sequence_number (uniq per referral).
        with transaction.atomic():
            referral_locked = Referral.objects.select_for_update().get(pk=referral.pk)
            last_seq = (
                ResponsibilityFormIssuance.objects.filter(referral_id=referral_locked.pk)
                .order_by('-sequence_number')
                .values_list('sequence_number', flat=True)
                .first()
                or 0
            )
            issuance = ResponsibilityFormIssuance.objects.create(
                referral=referral_locked,
                sequence_number=last_seq + 1,
                valid_from=vf,
                valid_to=vt,
                status='active',
                hospital_name_snapshot=referral_locked.facility,
                notes=notes,
                issued_by=request.user,
                document_file=request.FILES.get('document_file'),
            )
            # New issuance after initial approval must return to records for its own stamp acknowledgement.
            if referral_locked.status == 'approved_for_forms':
                referral_locked.status = 'records_review'
                referral_locked.save(update_fields=['status'])
        try:
            AuditService.log_activity(
                user=request.user,
                action='create',
                object_type='responsibility_form',
                object_id=str(issuance.id),
                module='consultation',
                object_repr=f'{referral.referral_id} Form #{issuance.sequence_number}',
                description=f'Issued responsibility form #{issuance.sequence_number} for referral {referral.referral_id}',
                new_values={
                    'referral_id': referral.referral_id,
                    'sequence_number': issuance.sequence_number,
                    'valid_from': str(issuance.valid_from),
                    'valid_to': str(issuance.valid_to),
                    'status': issuance.status,
                    'override_reason': override_reason if override_active else '',
                },
                request=request,
            )
        except Exception:
            pass
        return Response(ResponsibilityFormIssuanceSerializer(issuance).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def update_form_status(self, request, pk=None):
        """Update a responsibility form status (active/expired/revoked/used)."""
        if not self._is_records_officer(request.user):
            return Response({'detail': 'Only Medical Records can update form status.'}, status=status.HTTP_403_FORBIDDEN)
        referral = self.get_object()
        form_id = request.data.get('form_id')
        new_status = request.data.get('status')
        if not form_id or not new_status:
            return Response({'detail': 'form_id and status are required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            form = referral.responsibility_forms.get(id=form_id)
        except ResponsibilityFormIssuance.DoesNotExist:
            return Response({'detail': 'Form not found.'}, status=status.HTTP_404_NOT_FOUND)
        allowed = {s[0] for s in ResponsibilityFormIssuance.STATUS_CHOICES}
        if new_status not in allowed:
            return Response({'detail': f'Invalid status. Use one of: {", ".join(sorted(allowed))}.'}, status=status.HTTP_400_BAD_REQUEST)
        form.status = new_status
        form.save(update_fields=['status', 'updated_at'])
        try:
            AuditService.log_activity(
                user=request.user,
                action='update',
                object_type='responsibility_form',
                object_id=str(form.id),
                module='consultation',
                object_repr=f'{referral.referral_id} Form #{form.sequence_number}',
                description=f'Updated responsibility form #{form.sequence_number} status to {new_status}',
                new_values={'status': form.status},
                request=request,
            )
        except Exception:
            pass
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


class PresentingComplaintCategoryViewSet(viewsets.ModelViewSet):
    """Manage presenting complaint categories."""

    serializer_class = PresentingComplaintCategorySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name']
    ordering_fields = ['sort_order', 'name', 'created_at']
    ordering = ['sort_order', 'name']
    pagination_class = None

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsComplaintLibraryManager()]

    def get_queryset(self):
        queryset = PresentingComplaintCategory.objects.all().annotate(
            complaint_count=Count('complaints'),
            active_complaint_count=Count('complaints', filter=Q(complaints__is_active=True)),
        )
        active_only = str(self.request.query_params.get('active_only', '')).lower() in {'1', 'true', 'yes'}
        if active_only:
            queryset = queryset.filter(is_active=True)
        return queryset.prefetch_related('complaints')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['include_complaints'] = str(self.request.query_params.get('include_complaints', '')).lower() in {
            '1',
            'true',
            'yes',
        }
        context['active_only'] = str(self.request.query_params.get('active_only', '')).lower() in {
            '1',
            'true',
            'yes',
        }
        return context


class PresentingComplaintViewSet(viewsets.ModelViewSet):
    """Manage presenting complaint library items."""

    serializer_class = PresentingComplaintSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['label', 'category__name']
    ordering_fields = ['sort_order', 'label', 'category__sort_order', 'created_at']
    ordering = ['category__sort_order', 'sort_order', 'label']
    pagination_class = None

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsComplaintLibraryManager()]

    def get_queryset(self):
        queryset = PresentingComplaint.objects.select_related('category')
        active_only = str(self.request.query_params.get('active_only', '')).lower() in {'1', 'true', 'yes'}
        if active_only:
            queryset = queryset.filter(is_active=True, category__is_active=True)
        return queryset

    @action(detail=False, methods=['get'])
    def library(self, request):
        """
        Return grouped complaint library for consultation picker consumption.
        Query params:
        - include_inactive=1 (for admin screens)
        """
        include_inactive = str(request.query_params.get('include_inactive', '')).lower() in {'1', 'true', 'yes'}
        category_qs = PresentingComplaintCategory.objects.all().order_by('sort_order', 'name')
        if not include_inactive:
            category_qs = category_qs.filter(is_active=True)

        complaints_qs = PresentingComplaint.objects.select_related('category').order_by(
            'category__sort_order', 'category__name', 'sort_order', 'label'
        )
        if not include_inactive:
            complaints_qs = complaints_qs.filter(is_active=True, category__is_active=True)

        complaints_by_category_id = {}
        for complaint in complaints_qs:
            complaints_by_category_id.setdefault(complaint.category_id, []).append(
                {
                    'id': complaint.id,
                    'label': complaint.label,
                    'is_active': complaint.is_active,
                    'sort_order': complaint.sort_order,
                    'category': complaint.category_id,
                    'category_name': complaint.category.name,
                }
            )

        results = []
        for category in category_qs:
            results.append(
                {
                    'id': category.id,
                    'name': category.name,
                    'is_active': category.is_active,
                    'sort_order': category.sort_order,
                    'complaints': complaints_by_category_id.get(category.id, []),
                }
            )
        return Response(results)


class DiagnosisViewSet(viewsets.ModelViewSet):
    """ViewSet for managing patient diagnoses."""

    permission_classes = [IsAuthenticated]
    serializer_class = DiagnosisSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'visit', 'session', 'icd10_code', 'status', 'certainty']
    search_fields = ['diagnosis_text', 'icd10_code__code', 'icd10_code__description']
    ordering_fields = ['diagnosed_at', 'status']
    ordering = ['-diagnosed_at']

    def get_queryset(self):
        return Diagnosis.objects.all().select_related('patient', 'visit', 'session', 'icd10_code', 'diagnosed_by')

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
