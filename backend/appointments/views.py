"""
Views for the Appointments app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from datetime import datetime, timedelta

from .models import Appointment, AppointmentSlot
from .serializers import AppointmentSerializer, AppointmentSlotSerializer
from notifications.services import NotificationService


class AppointmentViewSet(viewsets.ModelViewSet):
    """ViewSet for managing appointments."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = AppointmentSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'doctor', 'clinic', 'status', 'appointment_type']
    search_fields = ['appointment_id', 'reason', 'notes']
    ordering_fields = ['appointment_date', 'appointment_time', 'created_at']
    ordering = ['appointment_date', 'appointment_time']
    
    def get_queryset(self):
        return Appointment.objects.all().select_related('patient', 'doctor', 'clinic', 'room', 'created_by')
    
    def perform_create(self, serializer):
        appointment = serializer.save(created_by=self.request.user)
        
        # Create notification for patient/doctor
        if appointment.patient:
            NotificationService.create_notification(
                user=appointment.patient.user if hasattr(appointment.patient, 'user') else None,
                title='Appointment Scheduled',
                message=f"Your appointment is scheduled for {appointment.appointment_date} at {appointment.appointment_time}",
                notification_type='appointment',
                priority='normal',
                object_type='appointment',
                object_id=str(appointment.id),
            )
    
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
        appointments = Appointment.objects.filter(
            appointment_date__gte=today,
            status__in=['scheduled', 'confirmed']
        ).order_by('appointment_date', 'appointment_time')
        serializer = AppointmentSerializer(appointments, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def today(self, request):
        """Get today's appointments."""
        today = timezone.now().date()
        appointments = Appointment.objects.filter(appointment_date=today)
        serializer = AppointmentSerializer(appointments, many=True)
        return Response(serializer.data)


class AppointmentSlotViewSet(viewsets.ModelViewSet):
    """ViewSet for managing appointment slots."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = AppointmentSlotSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['doctor', 'clinic', 'day_of_week', 'is_available']
    ordering_fields = ['day_of_week', 'start_time']
    ordering = ['day_of_week', 'start_time']
    
    def get_queryset(self):
        return AppointmentSlot.objects.all().select_related('doctor', 'clinic', 'room')

