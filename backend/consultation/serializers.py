"""
Serializers for the Consultation app.
"""
from rest_framework import serializers
from .models import ConsultationRoom, ConsultationSession, ConsultationQueue, Referral, Diagnosis, ICD10Code


class ConsultationRoomSerializer(serializers.ModelSerializer):
    """Serializer for ConsultationRoom model."""
    
    queue_count = serializers.SerializerMethodField()
    active_session = serializers.SerializerMethodField()
    clinic_name = serializers.CharField(source='clinic.name', read_only=True, allow_null=True)
    
    class Meta:
        model = ConsultationRoom
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'queue_count', 'active_session', 'clinic_name']
    
    def get_queue_count(self, obj):
        """Get count of active queue items for this room."""
        return obj.queue_items.filter(is_active=True).count()
    
    def get_active_session(self, obj):
        """Get active session for this room if any."""
        active_session = obj.sessions.filter(status='active').first()
        if active_session:
            return {
                'id': active_session.id,
                'session_id': active_session.session_id,
                'patient_name': active_session.patient.get_full_name(),
                'doctor_name': active_session.doctor.get_full_name() if active_session.doctor else None,
            }
        return None


class ConsultationSessionSerializer(serializers.ModelSerializer):
    """Serializer for ConsultationSession model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    patient_age = serializers.IntegerField(source='patient.age', read_only=True)
    patient_gender = serializers.CharField(source='patient.gender', read_only=True)
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    clinic_name = serializers.CharField(source='visit.clinic', read_only=True, allow_null=True)
    
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


class ReferralSerializer(serializers.ModelSerializer):
    """Serializer for Referral model."""

    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    referred_by_name = serializers.CharField(source='referred_by.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = Referral
        fields = '__all__'
        read_only_fields = ['referral_id', 'referred_at', 'created_at']


class ICD10CodeSerializer(serializers.ModelSerializer):
    """Serializer for ICD10Code model."""

    class Meta:
        model = ICD10Code
        fields = '__all__'


class DiagnosisSerializer(serializers.ModelSerializer):
    """Serializer for Diagnosis model."""

    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    diagnosed_by_name = serializers.CharField(source='diagnosed_by.get_full_name', read_only=True, allow_null=True)
    icd10_code_details = serializers.SerializerMethodField()

    class Meta:
        model = Diagnosis
        fields = '__all__'
        read_only_fields = ['diagnosed_at']

    def get_icd10_code_details(self, obj):
        """Get full ICD-10 code details."""
        if obj.icd10_code:
            return {
                'code': obj.icd10_code.code,
                'description': obj.icd10_code.description,
                'category': obj.icd10_code.category,
            }
        return None

