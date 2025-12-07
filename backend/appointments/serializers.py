"""
Serializers for the Appointments app.
"""
from rest_framework import serializers
from .models import Appointment, AppointmentSlot


class AppointmentSerializer(serializers.ModelSerializer):
    """Serializer for Appointment model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    clinic_name = serializers.CharField(source='clinic.name', read_only=True, allow_null=True)
    room_name = serializers.CharField(source='room.name', read_only=True, allow_null=True)
    
    class Meta:
        model = Appointment
        fields = '__all__'
        read_only_fields = ['appointment_id', 'created_at', 'updated_at']


class AppointmentSlotSerializer(serializers.ModelSerializer):
    """Serializer for AppointmentSlot model."""
    
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True)
    clinic_name = serializers.CharField(source='clinic.name', read_only=True, allow_null=True)
    room_name = serializers.CharField(source='room.name', read_only=True, allow_null=True)
    
    class Meta:
        model = AppointmentSlot
        fields = '__all__'

