"""
Views for the Eye Care app.
"""
import logging
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone

logger = logging.getLogger(__name__)


def _uploaded_files_for_key(request, key):
    """
    Collect all files for a repeated multipart field name.
    Uses both request.FILES and request.data (DRF merges files into data).
    """
    seen = set()
    out = []

    def add_upload(upload):
        if not upload or not hasattr(upload, 'read'):
            return
        uid = id(upload)
        if uid in seen:
            return
        seen.add(uid)
        out.append(upload)

    files = getattr(request, 'FILES', None)
    if files is not None and hasattr(files, 'getlist'):
        for f in files.getlist(key):
            add_upload(f)

    data = getattr(request, 'data', None)
    if data is not None and hasattr(data, 'getlist'):
        for item in data.getlist(key):
            add_upload(item)

    return out


from .models import EyeOrder, EyeSession, EyeSessionDiagnosticFile
from .serializers import (
    EyeOrderSerializer,
    EyeOrderCreateSerializer,
    EyeSessionSerializer,
    EyeSessionCreateSerializer,
    EyeSessionDiagnosticFileSerializer,
)
from audit.services import AuditService


class EyeOrderViewSet(viewsets.ModelViewSet):
    """ViewSet for managing eye care orders."""
    
    permission_classes = [IsAuthenticated]
    queryset = EyeOrder.objects.all().select_related('patient', 'ordered_by', 'visit')
    serializer_class = EyeOrderSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'ordered_by', 'status', 'priority', 'visit']
    search_fields = ['order_id', 'diagnosis', 'chief_complaint']
    ordering_fields = ['priority', 'ordered_at', 'scheduled_at']
    ordering = ['-ordered_at']
    
    def get_queryset(self):
        return EyeOrder.objects.all().select_related('patient', 'ordered_by', 'visit')
    
    def get_serializer_class(self):
        if self.action == 'create':
            return EyeOrderCreateSerializer
        return EyeOrderSerializer
    
    def perform_create(self, serializer):
        """Create eye order with automatic notification."""
        order = serializer.save(ordered_by=self.request.user)
        
        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='eye_order',
            object_id=str(order.id),
            module='eyecare',
            object_repr=f'Eye Order {order.id}',
            description=f'Created eye order for patient {order.patient.get_full_name()}',
            new_values={
                'patient': order.patient.get_full_name(),
                'priority': order.priority,
                'diagnosis': order.diagnosis,
            },
            request=self.request,
        )

        # Notify Eye Clinic staff
        try:
            from notifications.services import NotificationService

            patient_name = order.patient.get_full_name()
            title = "New Eye Clinic Order"
            message = f"Eye clinic order for {patient_name} has been created."

            NotificationService.notify_role(
                role_name='Medical Doctor',  # Eye clinic doctors
                title=title,
                message=message,
                notification_type='workflow',
                priority='normal',
                action_url=f"/eyecare/orders/{order.id}",
                object_type='eye_order',
                object_id=str(order.id),
            )
        except Exception:
            # Notifications must never break order creation
            pass
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark an eye order as completed."""
        order = self.get_object()
        order.status = 'completed'
        order.completed_at = timezone.now()
        order.save()
        
        return Response({'status': 'completed'})
    
    @action(detail=False, methods=['post'], url_path='checkin-from-visit')
    def checkin_from_visit(self, request):
        """Check in patient from a visit to eye clinic."""
        visit_id = request.data.get("visit")
        if not visit_id:
            raise ValidationError({"visit": "This field is required."})

        try:
            from patients.models import Visit
            visit = Visit.objects.select_related("patient").get(id=visit_id)
        except Visit.DoesNotExist:
            return Response({"detail": "Visit not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check if visit includes Eye Clinic
        visit_clinics = getattr(visit, 'clinics', []) or []
        primary_clinic = visit.clinic or ''
        
        is_eye_clinic = any('eye' in c.lower() for c in visit_clinics) or 'eye' in primary_clinic.lower()
        
        if not is_eye_clinic:
            return Response(
                {"detail": f"Visit clinic must include Eye Clinic"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        patient = visit.patient
        now = timezone.now()

        # Check if order already exists
        order = EyeOrder.objects.filter(
            patient=patient,
            consultation_session__isnull=True,
            ordered_at__date=now.date(),
            status__in=["pending", "scheduled", "in_progress"],
        ).first()
        
        if not order:
            # Create new order
            order = EyeOrder.objects.create(
                patient=patient,
                ordered_by=request.user,
                visit=visit,
                consultation_session=None,
                chief_complaint="Eye clinic follow-up",
                diagnosis="",
                treatment_plan="",
                special_instructions="Auto-created from multi-clinic visit",
                priority="routine",
                status="pending",
                scheduled_at=now,
            )
        else:
            if order.status == "pending":
                order.status = "scheduled"
                order.scheduled_at = order.scheduled_at or now
                order.save()

        return Response(EyeOrderSerializer(order).data, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['get'], url_path='checkins-for-visits')
    def checkins_for_visits(self, request):
        """Check which visits have eye clinic orders (parallel to physiotherapy endpoint)."""
        visit_ids_str = request.query_params.get('visit_ids', '')
        if not visit_ids_str:
            return Response({'results': {}}, status=status.HTTP_200_OK)
        
        try:
            visit_ids = [int(x.strip()) for x in visit_ids_str.split(',') if x.strip().isdigit()]
        except ValueError:
            return Response({'results': {}}, status=status.HTTP_200_OK)
        
        orders = EyeOrder.objects.filter(
            visit_id__in=visit_ids,
            status__in=['pending', 'scheduled', 'in_progress']
        ).order_by('visit_id', '-ordered_at')
        
        results = {}
        for order in orders:
            vid = str(order.visit_id)
            if vid not in results:  # First (most recent) order for this visit
                results[vid] = {
                    'checked_in': True,
                    'order_id': order.id,
                    'status': order.status,
                }
        
        return Response({'results': results}, status=status.HTTP_200_OK)


class EyeSessionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing eye clinic sessions."""
    
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = EyeSession.objects.all().select_related('order__patient').order_by('-scheduled_at')
    serializer_class = EyeSessionSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['order', 'status', 'scheduled_at']
    ordering_fields = ['scheduled_at', 'session_number']
    ordering = ['-scheduled_at']
    
    def get_queryset(self):
        return (
            EyeSession.objects.all()
            .select_related('order__patient')
            .prefetch_related('diagnostic_uploads')
            .order_by('-scheduled_at')
        )
    
    def get_serializer_class(self):
        if self.action == 'create':
            return EyeSessionCreateSerializer
        return EyeSessionSerializer
    
    def perform_create(self, serializer):
        """Create session and notify staff."""
        session = serializer.save()
        
        # Notify when session starts
        if session.status == 'in_progress':
            try:
                from notifications.services import NotificationService
                NotificationService.notify_role(
                    role_name='Medical Doctor',
                    title="Eye clinic session started",
                    message=f"Session {session.session_number} for {session.order.patient.get_full_name()} has started.",
                    notification_type='workflow',
                    priority='normal',
                )
            except Exception:
                pass

    def perform_update(self, serializer):
        session = serializer.save()
        for key, cat in (
            ('pachymetry_files', 'pachymetry'),
            ('oct_files', 'oct'),
            ('visual_field_files', 'visual_field'),
        ):
            for f in _uploaded_files_for_key(self.request, key):
                EyeSessionDiagnosticFile.objects.create(session=session, category=cat, file=f)
        cache = getattr(session, '_prefetched_objects_cache', None)
        if cache and 'diagnostic_uploads' in cache:
            del cache['diagnostic_uploads']


class EyeSessionDiagnosticFileViewSet(mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Remove an uploaded diagnostic file (pachymetry / OCT / visual field)."""

    permission_classes = [IsAuthenticated]
    queryset = EyeSessionDiagnosticFile.objects.select_related('session__order')
    serializer_class = EyeSessionDiagnosticFileSerializer
