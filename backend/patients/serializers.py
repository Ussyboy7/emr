"""
Serializers for the Patients app.
"""
from rest_framework import serializers
from .models import Patient, Visit, VitalReading, MedicalHistory


class PatientSerializer(serializers.ModelSerializer):
    """Serializer for Patient model."""
    
    full_name = serializers.SerializerMethodField()
    age = serializers.ReadOnlyField()
    
    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'category', 'title', 'surname', 'first_name', 'middle_name',
            'full_name', 'gender', 'date_of_birth', 'age', 'marital_status', 'photo',
            'personal_number', 'employee_type', 'division', 'location',
            'nonnpa_type', 'dependent_type', 'principal_staff',
            'email', 'phone', 'state_of_residence', 'residential_address',
            'state_of_origin', 'lga', 'permanent_address',
            'blood_group', 'genotype',
            'nok_first_name', 'nok_middle_name', 'nok_relationship', 'nok_address', 'nok_phone',
            'created_at', 'updated_at', 'is_active',
        ]
        read_only_fields = ['id', 'patient_id', 'created_at', 'updated_at', 'age']
    
    def get_full_name(self, obj):
        return obj.get_full_name()


class PatientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for patient lists."""
    
    full_name = serializers.SerializerMethodField()
    age = serializers.ReadOnlyField()
    
    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'category', 'full_name', 'gender', 'age',
            'phone', 'email', 'blood_group', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'patient_id', 'created_at', 'age']
    
    def get_full_name(self, obj):
        return obj.get_full_name()


class VisitSerializer(serializers.ModelSerializer):
    """Serializer for Visit model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = Visit
        fields = [
            'id', 'visit_id', 'patient', 'patient_name', 'visit_type', 'status',
            'date', 'time', 'clinic', 'doctor', 'doctor_name',
            'chief_complaint', 'clinical_notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'visit_id', 'created_at', 'updated_at']


class VitalReadingSerializer(serializers.ModelSerializer):
    """Serializer for VitalReading model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = VitalReading
        fields = [
            'id', 'visit', 'patient', 'patient_name',
            'temperature', 'blood_pressure_systolic', 'blood_pressure_diastolic',
            'heart_rate', 'respiratory_rate', 'oxygen_saturation',
            'weight', 'height', 'bmi',
            'notes', 'recorded_at', 'recorded_by', 'recorded_by_name',
        ]
        read_only_fields = ['id', 'bmi', 'recorded_at']


class MedicalHistorySerializer(serializers.ModelSerializer):
    """Serializer for MedicalHistory model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    
    class Meta:
        model = MedicalHistory
        fields = [
            'id', 'patient', 'patient_name',
            'allergies', 'diagnoses', 'current_medications',
            'surgical_history', 'family_history', 'social_history',
            'updated_at', 'updated_by',
        ]
        read_only_fields = ['id', 'updated_at']

