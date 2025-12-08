"""
Serializers for the Consultation app.
"""
from rest_framework import serializers
from .models import ConsultationRoom, ConsultationSession, ConsultationQueue


class ConsultationRoomSerializer(serializers.ModelSerializer):
    """Serializer for ConsultationRoom model."""
    
    class Meta:
        model = ConsultationRoom
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class ConsultationSessionSerializer(serializers.ModelSerializer):
    """Serializer for ConsultationSession model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    
    class Meta:
        model = ConsultationSession
        fields = '__all__'
        read_only_fields = ['session_id', 'started_at', 'created_at']


class ConsultationQueueSerializer(serializers.ModelSerializer):
    """Serializer for ConsultationQueue model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    
    class Meta:
        model = ConsultationQueue
        fields = '__all__'
        # Note: queued_at is not in read_only_fields to allow manual reordering

