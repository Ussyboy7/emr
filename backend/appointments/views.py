"""
Views for the Appointments app.
"""
import logging

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from datetime import datetime, timedelta

from common.mixins import ClinicScopedMixin
from common.openapi import document_viewset
from drf_spectacular.utils import extend_schema
from .models import Appointment, AppointmentSlot
from .serializers import AppointmentSerializer, AppointmentSlotSerializer
from .filters import AppointmentFilter
from notifications.services import NotificationService

logger = logging.getLogger(__name__)


@document_viewset(tag="Appointments", resource="appointments")
class AppointmentViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing appointments."""
    
    clinic_filter_field = 'clinic'
    serializer_class = AppointmentSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = AppointmentFilter
    search_fields = [
        'appointment_id',
        'reason',
        'notes',
        'patient__first_name',
        'patient__surname',
        'patient__patient_id',
    ]
    ordering_fields = ['appointment_date', 'appointment_time', 'created_at']
    ordering = ['appointment_date', 'appointment_time']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Appointment.objects.none()
        
        return self.scope_queryset(
            Appointment.objects.all().select_related('patient', 'doctor', 'clinic', 'room', 'created_by')
        )
    
    def perform_create(self, serializer):
        self.auto_set_clinic(serializer)
        appointment = serializer.save(created_by=self.request.user)

        patient_user = getattr(appointment.patient, "user", None)
        if patient_user is not None:
            try:
                NotificationService.create_notification(
                    user=patient_user,
                    title="Appointment Scheduled",
                    message=f"Your appointment is scheduled for {appointment.appointment_date} at {appointment.appointment_time}",
                    notification_type="appointment",
                    priority="low",
                    object_type="appointment",
                    object_id=str(appointment.id),
                )
            except Exception:
                logger.exception("Failed to create appointment notification (appointment already saved)")
    
    @extend_schema(tags=["Appointments"], summary="Confirm appointment")
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm an appointment."""
        appointment = self.get_object()
        appointment.status = 'confirmed'
        appointment.save()
        return Response(AppointmentSerializer(appointment).data)
    
    @extend_schema(tags=["Appointments"], summary="Cancel appointment")
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel an appointment."""
        appointment = self.get_object()
        appointment.status = 'cancelled'
        appointment.save()
        return Response(AppointmentSerializer(appointment).data)
    
    @extend_schema(tags=["Appointments"], summary="List upcoming appointments")
    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """Get upcoming appointments."""
        today = timezone.now().date()
        appointments = self.get_queryset().filter(
            appointment_date__gte=today,
            status__in=['scheduled', 'confirmed']
        ).order_by('appointment_date', 'appointment_time')
        serializer = AppointmentSerializer(appointments, many=True)
        return Response(serializer.data)
    
    @extend_schema(tags=["Appointments"], summary="List today's appointments")
    @action(detail=False, methods=['get'])
    def today(self, request):
        """Get today's appointments."""
        today = timezone.now().date()
        appointments = self.get_queryset().filter(appointment_date=today)
        serializer = AppointmentSerializer(appointments, many=True)
        return Response(serializer.data)

    @extend_schema(tags=["Appointments"], summary="Appointment list tab counts")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Tab counts for appointments list (replaces 4 parallel COUNT requests)."""
        from common.list_stats import aggregate_status_counts, viewset_queryset_excluding_params

        qs = viewset_queryset_excluding_params(self, frozenset({'status', 'page', 'page_size', 'ordering'}))
        return Response(
            aggregate_status_counts(
                qs,
                'status',
                {
                    'scheduled': 'scheduled',
                    'confirmed': 'confirmed',
                    'inProgress': 'in_progress',
                },
            )
        )


@document_viewset(tag="Appointments", resource="appointment slots")
class AppointmentSlotViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing appointment slots."""
    
    clinic_filter_field = 'clinic'
    serializer_class = AppointmentSlotSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['doctor', 'clinic', 'day_of_week', 'is_available']
    ordering_fields = ['day_of_week', 'start_time']
    ordering = ['day_of_week', 'start_time']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return AppointmentSlot.objects.none()
        
        return self.scope_queryset(
            AppointmentSlot.objects.all().select_related('doctor', 'clinic', 'room')
        )

    def perform_create(self, serializer):
        self.auto_set_clinic(serializer)
        serializer.save()

