"""
Views for the Physiotherapy app.
"""
import traceback

from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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
        serializer.save(ordered_by=self.request.user, sessions_completed=0)

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