"""
Views for the Physiotherapy app.
"""
import traceback

from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.clinic_utils import normalize_clinic_name
from patients.models import Visit
from .models import PhysioTemplate, PhysioOrder, PhysioSession
from .serializers import (
    PhysioTemplateSerializer,
    PhysioOrderSerializer,
    PhysioOrderCreateSerializer,
    PhysioSessionSerializer,
    PhysioSessionCreateSerializer,
)


class PhysioTemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for managing physiotherapy templates."""
    permission_classes = [IsAuthenticated]
    serializer_class = PhysioTemplateSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'code', 'description']
    ordering = ['category', 'name']

    def get_queryset(self):
        return PhysioTemplate.objects.all()


class PhysioOrderViewSet(viewsets.ModelViewSet):
    """ViewSet for managing physiotherapy orders."""
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'patient', 'priority', 'consultation_session']
    search_fields = ['patient__full_name', 'patient__patient_id', 'diagnosis', 'chief_complaint']
    ordering = ['-ordered_at']

    def get_queryset(self):
        return PhysioOrder.objects.select_related('patient', 'ordered_by').all()

    def get_serializer_class(self):
        if self.action == 'create':
            return PhysioOrderCreateSerializer
        return PhysioOrderSerializer

    def perform_create(self, serializer):
        order = serializer.save(ordered_by=self.request.user, sessions_completed=0)

        # Notify Physiotherapy (doctor -> physiotherapy)
        try:
            from notifications.services import NotificationService

            patient_name = order.patient.get_full_name() if getattr(order, 'patient', None) else 'Patient'
            title = "New physiotherapy order"
            message = f"Physiotherapy order for {patient_name} has been created."

            NotificationService.notify_role(
                role_name='Physiotherapist',
                title=title,
                message=message,
                notification_type='workflow',
                priority='normal',
                action_url="/physiotherapy/pool-queue",
                object_type='physio_order',
                object_id=str(order.id),
            )
        except Exception:
            # Notifications must never break physio order creation
            pass

    @action(detail=False, methods=['post'], url_path='checkin-from-visit')
    def checkin_from_visit(self, request):
        visit_id = request.data.get("visit")
        if not visit_id:
            raise ValidationError({"visit": "This field is required."})

        try:
            visit = Visit.objects.select_related("patient").get(id=visit_id)
        except Visit.DoesNotExist:
            return Response({"detail": "Visit not found."}, status=status.HTTP_404_NOT_FOUND)

        clinic = normalize_clinic_name(visit.clinic or "")
        if clinic != "Physiotherapy":
            return Response(
                {"detail": f"Visit clinic must be Physiotherapy (got '{clinic}')."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        patient = visit.patient
        now = timezone.now()
        created = False

        order = (
            PhysioOrder.objects.filter(
                patient=patient,
                consultation_session__isnull=True,
                ordered_at__date=visit.date,
                status__in=["pending", "scheduled", "in_progress"],
            )
            .order_by("-ordered_at")
            .first()
        )
        if not order:
            order = (
                PhysioOrder.objects.filter(
                    patient=patient,
                    status__in=["pending", "scheduled", "in_progress"],
                )
                .order_by("-ordered_at")
                .first()
            )

        if not order:
            last_order = PhysioOrder.objects.filter(patient=patient).order_by("-ordered_at").first()
            order = PhysioOrder.objects.create(
                patient=patient,
                ordered_by=request.user,
                consultation_session=None,
                diagnosis=(last_order.diagnosis if last_order else "") or "",
                chief_complaint=(last_order.chief_complaint if last_order else "") or "Physiotherapy follow-up",
                treatment_goal=(last_order.treatment_goal if last_order else "") or "",
                special_instructions=(last_order.special_instructions if last_order else "") or "",
                priority="routine",
                status="scheduled",
                scheduled_at=now,
                sessions_completed=0,
            )
            created = True
        else:
            if order.status == "pending":
                order.status = "scheduled"
                order.scheduled_at = order.scheduled_at or now
                order.save()

        try:
            from notifications.services import NotificationService

            patient_name = patient.get_full_name() if patient else "Patient"
            title = "Physiotherapy check-in"
            message = f"{patient_name} checked in for physiotherapy (Visit {visit.visit_id})."

            NotificationService.notify_role(
                role_name="Physiotherapist",
                title=title,
                message=message,
                notification_type="workflow",
                priority="normal",
                action_url="/physiotherapy/pool-queue",
                object_type="physio_order",
                object_id=str(order.id),
            )
        except Exception:
            pass

        payload = PhysioOrderSerializer(order).data
        return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def schedule(self, request, pk=None):
        """Schedule a physiotherapy order."""
        order = self.get_object()
        scheduled_at = request.data.get('scheduled_at')

        if not scheduled_at:
            return Response({'error': 'scheduled_at is required'}, status=status.HTTP_400_BAD_REQUEST)

        order.scheduled_at = scheduled_at
        order.status = 'scheduled'
        order.save()

        serializer = self.get_serializer(order)
        return Response(serializer.data)


class PhysioSessionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing physiotherapy sessions."""
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'physiotherapist', 'order']
    search_fields = []
    ordering = ['-created_at']

    def get_queryset(self):
        return PhysioSession.objects.select_related(
            'order', 'order__patient', 'physiotherapist'
        ).all()

    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except Exception as e:
            traceback.print_exc()
            # Return paginated shape so frontend does not break
            return Response({'results': [], 'count': 0}, status=200)

    @action(detail=True, methods=['post'])
    def start_session(self, request, pk=None):
        session = self.get_object()
        session.status = 'in_progress'
        session.started_at = timezone.now()
        session.save()
        if session.order.status == 'scheduled':
            session.order.status = 'in_progress'
            session.order.save()
        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=['post'])
    def complete_session(self, request, pk=None):
        session = self.get_object()
        session.completed_at = timezone.now()
        session.status = 'completed'
        session.save()
        order = session.order
        order.sessions_completed = order.sessions.filter(status='completed').count()
        # Mark order as completed when any session is completed
        if order.status != 'completed':
            order.status = 'completed'
            order.completed_at = timezone.now()
        order.save()
        return Response(self.get_serializer(session).data)

    @action(detail=False, methods=['post'])
    def create_next_session(self, request):
        """Create the next session in a treatment plan."""
        order_id = request.data.get('order_id')
        scheduled_at = request.data.get('scheduled_at')
        physiotherapist_id = request.data.get('physiotherapist_id')
        notes = request.data.get('notes', '')
        try:
            order = PhysioOrder.objects.get(id=order_id)
            last_session = order.sessions.order_by('-session_number').first()
            next_session_number = (last_session.session_number if last_session else 0) + 1
            session = PhysioSession.objects.create(
                order=order,
                physiotherapist_id=physiotherapist_id,
                session_number=next_session_number,
                scheduled_at=scheduled_at,
                session_notes=notes or '',
                status='scheduled',
            )
            return Response(self.get_serializer(session).data, status=status.HTTP_201_CREATED)
        except PhysioOrder.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get_serializer_class(self):
        if self.action == 'create':
            return PhysioSessionCreateSerializer
        return PhysioSessionSerializer


class PhysioStatsView(APIView):
    """API view for physiotherapy statistics."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        total_orders = PhysioOrder.objects.count()
        pending_orders = PhysioOrder.objects.filter(status='pending').count()
        completed_sessions = PhysioSession.objects.filter(status='completed').count()
        active_sessions = PhysioSession.objects.filter(status='in_progress').count()
        total_sessions = PhysioSession.objects.count()

        return Response({
            'total_orders': total_orders,
            'pending_orders': pending_orders,
            'completed_sessions': completed_sessions,
            'active_sessions': active_sessions,
            'total_sessions': total_sessions,
        })
