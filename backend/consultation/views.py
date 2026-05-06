"""
Views for the Consultation app.
"""
import logging
from django.db.models import Count, Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from laboratory.pagination import FlexiblePageNumberPagination

logger = logging.getLogger(__name__)

from .models import (
    ConsultationRoom,
    ConsultationSession,
    ConsultationQueue,
    Referral,
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
    DiagnosisSerializer,
    ICD10CodeSerializer,
    PresentingComplaintCategorySerializer,
    PresentingComplaintSerializer,
)
from audit.services import AuditService
from patients.workflow import close_visit_workflow


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
    search_fields = ['session_id', 'notes']
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
    
    def perform_create(self, serializer):
        """Create consultation session and log audit."""
        # Set the doctor field using multiple fallback strategies
        data = serializer.validated_data.copy()
        if 'doctor' not in data or data['doctor'] is None:
            doctor = self._find_doctor_for_session(data)
            if doctor:
                data['doctor'] = doctor

        session = serializer.save(created_by=self.request.user, **data)

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

        from .analytics import build_comprehensive_consultation_analytics
        analytics = build_comprehensive_consultation_analytics(base, start_date, end_date)

        # Add clinical outcomes data
        try:
            from pharmacy.models import Prescription
            from laboratory.models import LabOrder
            from nursing.models import NursingOrder

            # Get visits from completed sessions
            completed_session_visits = set(
                base.filter(status='completed')
                .exclude(visit__isnull=True)
                .values_list('visit_id', flat=True)
            )

            if completed_session_visits:
                analytics['clinical_outcomes'] = {
                    'prescriptions': Prescription.objects.filter(visit_id__in=completed_session_visits).count(),
                    'lab_orders': LabOrder.objects.filter(visit_id__in=completed_session_visits).count(),
                    'nursing_orders': NursingOrder.objects.filter(visit_id__in=completed_session_visits).count(),
                }
            else:
                analytics['clinical_outcomes'] = {
                    'prescriptions': 0,
                    'lab_orders': 0,
                    'nursing_orders': 0,
                }
        except Exception as e:
            # If clinical outcomes queries fail, provide default values
            analytics['clinical_outcomes'] = {
                'prescriptions': 0,
                'lab_orders': 0,
                'nursing_orders': 0,
            }

        # Add referral stats
        try:
            from .models import Referral
            period_referrals = Referral.objects.filter(
                referred_at__gte=start_date,
                referred_at__lte=end_date
            )
            analytics['referrals'] = {
                'total': period_referrals.count(),
                'pending': period_referrals.filter(status__in=['draft', 'sent']).count(),
                'completed': period_referrals.filter(status='completed').count(),
            }
        except Exception as e:
            # If referral queries fail, provide default values
            analytics['referrals'] = {
                'total': 0,
                'pending': 0,
                'completed': 0,
            }

        # Add diagnosis stats
        from .models import Diagnosis
        period_diagnoses = Diagnosis.objects.filter(
            diagnosed_at__gte=start_date,
            diagnosed_at__lte=end_date
        )
        analytics['diagnoses'] = {
            'total': period_diagnoses.count(),
            'by_certainty': {
                certainty: period_diagnoses.filter(certainty=certainty).count()
                for certainty in ['confirmed', 'probable', 'possible', 'ruled_out']
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
        qs = self.get_queryset().filter(visit_id__in=ids, is_active=True)
        return Response({'results': ConsultationQueueByVisitSerializer(qs, many=True).data})

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


class ReferralViewSet(viewsets.ModelViewSet):
    """ViewSet for managing referrals."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ReferralSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'visit', 'session', 'referred_by', 'specialty', 'facility', 'status', 'urgency']
    search_fields = ['referral_id', 'specialty', 'facility', 'reason', 'clinical_summary']
    ordering_fields = ['referred_at', 'urgency']
    ordering = ['-referred_at']
    
    def get_queryset(self):
        return Referral.objects.all().select_related('patient', 'visit', 'session', 'referred_by', 'created_by')
    
    def perform_create(self, serializer):
        """Create referral and log audit."""
        referral = serializer.save(created_by=self.request.user, referred_by=self.request.user)
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
