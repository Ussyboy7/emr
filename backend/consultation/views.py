"""
Views for the Consultation app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone

from .models import ConsultationRoom, ConsultationSession, ConsultationQueue, Referral
from .serializers import (
    ConsultationRoomSerializer,
    ConsultationSessionSerializer,
    ConsultationQueueSerializer,
    ReferralSerializer,
)
from audit.services import AuditService


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
        queue_items = room.queue_items.filter(is_active=True).order_by('priority', 'queued_at')
        serializer = ConsultationQueueSerializer(queue_items, many=True)
        return Response(serializer.data)


class ConsultationSessionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing consultation sessions."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ConsultationSessionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['room', 'patient', 'doctor', 'status']
    search_fields = ['session_id', 'chief_complaint', 'notes']
    ordering_fields = ['started_at']
    ordering = ['-started_at']
    
    def get_queryset(self):
        return ConsultationSession.objects.all().select_related('room', 'patient', 'doctor', 'visit', 'created_by')
    
    def perform_create(self, serializer):
        """Create consultation session and log audit."""
        session = serializer.save(created_by=self.request.user)
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
        session = self.get_object()
        old_status = session.status
        session.status = 'completed'
        session.ended_at = timezone.now()
        session.save()
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
    filterset_fields = ['room', 'patient', 'is_active']
    ordering_fields = ['priority', 'queued_at']
    ordering = ['priority', 'queued_at']
    
    def get_queryset(self):
        return ConsultationQueue.objects.all().select_related('room', 'patient', 'visit')
    
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

