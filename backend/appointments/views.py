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
from .models import Appointment, AppointmentSlot
from .serializers import AppointmentSerializer, AppointmentSlotSerializer
from .filters import AppointmentFilter
from notifications.services import NotificationService

logger = logging.getLogger(__name__)


class AppointmentViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing appointments."""
    
    clinic_filter_field = 'clinic'
    permission_classes = [IsAuthenticated]
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
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm an appointment."""
        appointment = self.get_object()
        appointment.status = 'confirmed'
        appointment.save()
        return Response(AppointmentSerializer(appointment).data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel an appointment."""
        appointment = self.get_object()
        appointment.status = 'cancelled'
        appointment.save()
        return Response(AppointmentSerializer(appointment).data)
    
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
    
    @action(detail=False, methods=['get'])
    def today(self, request):
        """Get today's appointments."""
        today = timezone.now().date()
        appointments = self.get_queryset().filter(appointment_date=today)
        serializer = AppointmentSerializer(appointments, many=True)
        return Response(serializer.data)


class AppointmentSlotViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing appointment slots."""
    
    clinic_filter_field = 'clinic'
    permission_classes = [IsAuthenticated]
    serializer_class = AppointmentSlotSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['doctor', 'clinic', 'day_of_week', 'is_available']
    ordering_fields = ['day_of_week', 'start_time']
    ordering = ['day_of_week', 'start_time']
    
    def get_queryset(self):
        return self.scope_queryset(
            AppointmentSlot.objects.all().select_related('doctor', 'clinic', 'room')
        )

    def perform_create(self, serializer):
        self.auto_set_clinic(serializer)
        serializer.save()

