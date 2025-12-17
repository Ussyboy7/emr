"""
Serializers for the Patients app.
"""
from rest_framework import serializers
from .models import Patient, Visit, VitalReading, MedicalHistory


class PatientSerializer(serializers.ModelSerializer):
    """Serializer for Patient model."""
    
    full_name = serializers.SerializerMethodField()
    age = serializers.ReadOnlyField()
    photo = serializers.SerializerMethodField()
    
    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'category', 'title', 'surname', 'first_name', 'middle_name',
            'full_name', 'gender', 'date_of_birth', 'age', 'marital_status', 'religion', 'tribe', 'occupation', 'photo',
            'personal_number', 'employee_type', 'division', 'location',
            'nonnpa_type', 'dependent_type', 'principal_staff',
            'email', 'phone', 'state_of_residence', 'residential_address',
            'state_of_origin', 'lga', 'permanent_address',
            'blood_group', 'genotype', 'allergies',
            'nok_surname', 'nok_first_name', 'nok_middle_name', 'nok_relationship', 'nok_address', 'nok_phone',
            'created_at', 'updated_at', 'is_active',
        ]
        read_only_fields = ['id', 'patient_id', 'created_at', 'updated_at', 'age']
    
    def get_full_name(self, obj):
        return obj.get_full_name()
    
    def get_photo(self, obj):
        """Return the photo URL if photo exists."""
        if obj.photo:
            # Return relative URL - frontend will construct full URL
            return obj.photo.url
        return None


class PatientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for patient lists."""
    
    full_name = serializers.SerializerMethodField()
    age = serializers.ReadOnlyField()
    photo = serializers.SerializerMethodField()
    
    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'category', 'full_name', 'gender', 'age',
            'phone', 'email', 'blood_group', 'is_active', 'created_at', 'photo',
        ]
        read_only_fields = ['id', 'patient_id', 'created_at', 'age']
    
    def get_full_name(self, obj):
        return obj.get_full_name()
    
    def get_photo(self, obj):
        """Return the photo URL if photo exists."""
        if obj.photo:
            # Return relative URL - frontend will construct full URL
            return obj.photo.url
        return None


class VisitSerializer(serializers.ModelSerializer):
    """Serializer for Visit model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    vitals = serializers.SerializerMethodField()
    
    def get_vitals(self, obj):
        """Get the most recent vital reading for this visit."""
        vital = obj.vital_readings.first()
        if vital:
            return {
                'bp': f"{vital.blood_pressure_systolic or ''}/{vital.blood_pressure_diastolic or ''}".strip('/'),
                'pulse': str(vital.heart_rate) if vital.heart_rate else '',
                'temp': str(vital.temperature) if vital.temperature else '',
                'respRate': str(vital.respiratory_rate) if vital.respiratory_rate else '',
                'spo2': str(vital.oxygen_saturation) if vital.oxygen_saturation else '',
                'weight': str(vital.weight) if vital.weight else '',
                'height': str(vital.height) if vital.height else '',
                'bmi': str(vital.bmi) if vital.bmi else '',
            }
        return {
            'bp': '', 'pulse': '', 'temp': '', 'respRate': '', 'spo2': '', 'weight': '', 'height': '', 'bmi': ''
        }
    
    def validate_clinic(self, value):
        """Normalize clinic name before validation."""
        if value:
            from common.clinic_utils import normalize_clinic_name
            return normalize_clinic_name(value)
        return value
    
    class Meta:
        model = Visit
        fields = [
            'id', 'visit_id', 'patient', 'patient_name', 'visit_type', 'status',
            'date', 'time', 'clinic', 'location', 'doctor', 'doctor_name',
            'chief_complaint', 'clinical_notes', 'vitals',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'visit_id', 'created_at', 'updated_at', 'vitals']


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
    
    def validate_height(self, value):
        """Validate height is in reasonable range (30-300 cm)."""
        if value is not None:
            if value < 30 or value > 300:
                raise serializers.ValidationError(
                    f"Height must be between 30 and 300 cm. Got: {value} cm. "
                    "Please check if height is entered in the correct unit (cm)."
                )
        return value
    
    def validate_weight(self, value):
        """Validate weight is in reasonable range (1-500 kg)."""
        if value is not None:
            if value < 1 or value > 500:
                raise serializers.ValidationError(
                    f"Weight must be between 1 and 500 kg. Got: {value} kg. "
                    "Please check if weight is entered in the correct unit (kg)."
                )
        return value


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

