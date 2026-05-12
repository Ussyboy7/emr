"""
Serializers for the Patients app.
"""
from rest_framework import serializers
from .models import Patient, Visit, VitalReading, MedicalHistory, MedicalCertificate


class PatientSerializer(serializers.ModelSerializer):
    """Serializer for Patient model."""
    
    full_name = serializers.SerializerMethodField()
    age = serializers.ReadOnlyField()
    age_display = serializers.ReadOnlyField()
    photo = serializers.SerializerMethodField()
    
    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'category', 'title', 'surname', 'first_name', 'middle_name',
            'full_name', 'gender', 'date_of_birth', 'age', 'age_display', 'marital_status', 'religion', 'tribe', 'occupation', 'photo',
            'personal_number', 'employee_type', 'division', 'location', 'location_clinic',
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

    def _resolve_location_clinic(self, location_str):
        """Resolve location_clinic from facility name or numeric facility id."""
        if not location_str:
            return None
        try:
            from organization.utils import resolve_facility_from_location_value

            return resolve_facility_from_location_value(location_str)
        except Exception:
            return None

    def create(self, validated_data):
        location_str = validated_data.get('location')
        if location_str and validated_data.get('location_clinic') is None:
            clinic = self._resolve_location_clinic(location_str)
            if clinic:
                validated_data['location_clinic'] = clinic
        return super().create(validated_data)

    def update(self, instance, validated_data):
        location_str = validated_data.get('location', instance.location)
        if location_str and 'location_clinic' not in validated_data:
            clinic = self._resolve_location_clinic(location_str)
            validated_data['location_clinic'] = clinic
        return super().update(instance, validated_data)
    
    def validate(self, attrs):
        """Custom validation for patient data."""
        attrs = super().validate(attrs)
        
        # Validate personal number uniqueness for Employee/Retiree
        personal_number = attrs.get('personal_number')
        category = attrs.get('category')
        principal_staff = attrs.get('principal_staff', self.instance.principal_staff if self.instance else None)
        
        if personal_number and category in ['employee', 'retiree']:
            from .validators import validate_personal_number_uniqueness
            validate_personal_number_uniqueness(
                personal_number,
                patient_id=self.instance.id if self.instance else None,
                category=category
            )

        if category == 'dependent':
            if not principal_staff:
                raise serializers.ValidationError({
                    'principal_staff': 'Principal (employee or retiree) is required for dependent patients.'
                })

            if principal_staff.category not in ['employee', 'retiree']:
                raise serializers.ValidationError({
                    'principal_staff': 'Principal must be an employee or retiree.'
                })

            if not (principal_staff.personal_number or '').strip():
                raise serializers.ValidationError({
                    'principal_staff': 'Principal must have a valid personal number.'
                })
        
        return attrs
    


class PatientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for patient lists."""

    full_name = serializers.SerializerMethodField()
    age = serializers.ReadOnlyField()
    age_display = serializers.ReadOnlyField()
    gender = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()
    total_visits = serializers.SerializerMethodField()
    last_visit_at = serializers.SerializerMethodField()
    # Dependent / principal (list + Manage Dependents; queryset uses select_related("principal_staff"))
    principal_staff_full_name = serializers.SerializerMethodField()
    principal_staff_patient_id = serializers.SerializerMethodField()
    principal_staff_category = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'category', 'surname', 'first_name', 'full_name', 'gender', 'age',
            'age_display', 'date_of_birth', 'personal_number', 'phone', 'email', 'blood_group', 'is_active', 'created_at', 'photo',
            'total_visits', 'last_visit_at',
            'dependent_type', 'principal_staff', 'nok_relationship',
            'principal_staff_full_name', 'principal_staff_patient_id', 'principal_staff_category',
        ]
        read_only_fields = ['id', 'patient_id', 'created_at', 'age']

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_gender(self, obj):
        return obj.get_gender_display() if obj.gender else ''

    def get_principal_staff_full_name(self, obj):
        p = getattr(obj, 'principal_staff', None)
        if p is None:
            return ''
        return p.get_full_name()

    def get_principal_staff_patient_id(self, obj):
        p = getattr(obj, 'principal_staff', None)
        if p is None:
            return ''
        return (p.patient_id or '').strip()

    def get_principal_staff_category(self, obj):
        p = getattr(obj, 'principal_staff', None)
        if p is None:
            return ''
        return p.category or ''

    def get_photo(self, obj):
        """Return the photo URL if photo exists."""
        if obj.photo:
            # Return relative URL - frontend will construct full URL
            return obj.photo.url
        return None

    def get_total_visits(self, obj):
        return obj.visits.count()

    def get_last_visit_at(self, obj):
        last_visit = obj.visits.order_by('-date', '-time', '-created_at').first()
        if not last_visit:
            return None
        # Combine visit date+time to preserve chronology in UI
        return f"{last_visit.date}T{last_visit.time}"
    


class VisitSerializer(serializers.ModelSerializer):
    """Serializer for Visit model."""

    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    age = serializers.IntegerField(source='patient.age', read_only=True)
    gender = serializers.SerializerMethodField()
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    is_new_registration = serializers.SerializerMethodField()
    is_first_visit = serializers.SerializerMethodField()
    is_returning_visit = serializers.SerializerMethodField()
    patient_visit_status = serializers.SerializerMethodField()
    vitals = serializers.SerializerMethodField()

    def get_gender(self, obj):
        patient = getattr(obj, 'patient', None)
        if not patient or not patient.gender:
            return ''
        return patient.get_gender_display()
    
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
                'bloodPressureSystolic': str(vital.blood_pressure_systolic) if vital.blood_pressure_systolic else '',
                'bloodPressureDiastolic': str(vital.blood_pressure_diastolic) if vital.blood_pressure_diastolic else '',
                'recordedAt': vital.recorded_at.isoformat() if vital.recorded_at else '',
            }
        return {
            'bp': '', 'pulse': '', 'temp': '', 'respRate': '', 'spo2': '', 'weight': '', 'height': '', 'bmi': ''
        }

    def get_is_new_registration(self, obj):
        patient = getattr(obj, 'patient', None)
        if not patient or not patient.created_at:
            return False
        return patient.created_at.date() == obj.date

    def get_is_first_visit(self, obj):
        annotated_first_visit_id = getattr(obj, 'first_visit_id', None)
        if annotated_first_visit_id is not None:
            return annotated_first_visit_id == obj.id

        first_visit = obj.patient.visits.order_by('date', 'time', 'created_at', 'id').values_list('id', flat=True).first()
        return first_visit == obj.id

    def get_is_returning_visit(self, obj):
        return not self.get_is_first_visit(obj)

    def get_patient_visit_status(self, obj):
        if self.get_is_first_visit(obj):
            return 'First Visit'
        if self.get_is_new_registration(obj):
            return 'Newly Registered'
        return 'Returning'
    
    def validate_clinic(self, value):
        """Normalize clinic name before validation."""
        if value:
            from common.clinic_utils import normalize_clinic_name
            return normalize_clinic_name(value)
        return value

    def _resolve_location_clinic(self, location_str):
        """Resolve location_clinic from facility name or numeric facility id."""
        if not location_str:
            return None
        try:
            from organization.utils import resolve_facility_from_location_value

            return resolve_facility_from_location_value(location_str)
        except Exception:
            return None

    def create(self, validated_data):
        location_str = validated_data.get('location')
        if location_str and validated_data.get('location_clinic') is None:
            clinic = self._resolve_location_clinic(location_str)
            if clinic:
                validated_data['location_clinic'] = clinic
        return super().create(validated_data)

    def update(self, instance, validated_data):
        location_str = validated_data.get('location', instance.location)
        if location_str and 'location_clinic' not in validated_data:
            clinic = self._resolve_location_clinic(location_str)
            validated_data['location_clinic'] = clinic
        return super().update(instance, validated_data)


    def validate(self, attrs):
        """
        Prevent duplicate *open* visits for same patient on same date with SAME clinics.
        
        Multi-clinic visits are allowed - a patient can have ONE visit with multiple clinics.
        "Open" = scheduled or in_progress. Completed/cancelled are allowed to have another visit.
        """
        attrs = super().validate(attrs)

        patient = attrs.get('patient', self.instance.patient if self.instance else None)
        date = attrs.get('date', self.instance.date if self.instance else None)
        status = attrs.get('status', self.instance.status if self.instance else None)
        new_clinics = attrs.get('clinics', self.instance.clinics if self.instance else [])

        # Guardrail after visit enters active workflow:
        # keep edit available, but restrict to safe fields only.
        if self.instance and self.instance.status in ['in_progress', 'completed']:
            locked_fields = {
                'patient', 'date', 'time', 'visit_type', 'doctor', 'location', 'location_clinic'
            }
            attempted_locked_updates = [field for field in locked_fields if field in attrs]
            if attempted_locked_updates:
                raise serializers.ValidationError({
                    'non_field_errors': [
                        'This visit is already in workflow. You can only update clinics and notes.'
                    ]
                })

            # Never allow removing clinics that are already completed for the visit.
            if 'clinics' in attrs:
                existing_done = set(self.instance.completed_clinics or [])
                requested = set(new_clinics or [])
                removed_done = sorted(existing_done - requested)
                if removed_done:
                    raise serializers.ValidationError({
                        'clinics': [
                            f'Cannot remove clinic(s) already completed: {", ".join(removed_done)}.'
                        ]
                    })

        # Enforce only on create, or when patient/date/status is being changed.
        # This avoids blocking unrelated PATCH updates when duplicates already exist.
        should_check_duplicates = (self.instance is None) or any(
            key in attrs for key in ('patient', 'date', 'status')
        )

        if should_check_duplicates and patient and date:
            open_statuses = ['scheduled', 'in_progress']
            if status in open_statuses:
                # Check for existing open visits
                existing_visits = Visit.objects.filter(
                    patient=patient, 
                    date=date, 
                    status__in=open_statuses
                )
                if self.instance:
                    existing_visits = existing_visits.exclude(pk=self.instance.pk)
                
                # If there's an existing visit, check if clinics overlap
                if existing_visits.exists():
                    # For now, allow only ONE multi-clinic visit per patient per day
                    # The visit can have multiple clinics, but we don't allow duplicate visits
                    raise serializers.ValidationError({
                        'non_field_errors': [
                            'This patient already has an open visit for this date. Please add all required clinics to the existing visit, or complete/cancel it first.'
                        ]
                    })

        return attrs
    
    class Meta:
        model = Visit
        fields = [
            'id', 'visit_id', 'patient', 'patient_id', 'patient_name', 'age', 'gender', 'visit_type', 'status',
            'date', 'time', 'clinic', 'clinics', 'completed_clinics', 'location', 'location_clinic', 'doctor', 'doctor_name',
            'clinical_notes', 'vitals',
            'is_new_registration', 'is_first_visit', 'is_returning_visit', 'patient_visit_status',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'visit_id', 'created_at', 'updated_at', 'vitals', 'age', 'gender']
        extra_kwargs = {
            'clinics': {'required': False},
            'completed_clinics': {'required': False},
        }


class VitalReadingSerializer(serializers.ModelSerializer):
    """Serializer for VitalReading model."""

    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = VitalReading
        fields = [
            'id', 'visit', 'patient', 'patient_id', 'patient_name',
            'temperature', 'blood_pressure_systolic', 'blood_pressure_diastolic',
            'heart_rate', 'respiratory_rate', 'oxygen_saturation',
            'weight', 'height', 'bmi', 'pain_scale', 'blood_sugar', 'random_blood_sugar',
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


class MedicalCertificateSerializer(serializers.ModelSerializer):
    """
    Serializer for persisted medical certificate records.
    """

    patient_name = serializers.CharField(source="patient.get_full_name", read_only=True)
    issued_by_name = serializers.CharField(source="issued_by.get_full_name", read_only=True, allow_null=True)

    def validate(self, attrs):
        purpose = attrs.get("purpose")
        if purpose is None and self.instance is not None:
            purpose = self.instance.purpose

        valid_from = attrs.get("valid_from")
        valid_to = attrs.get("valid_to")
        if valid_from is None and self.instance is not None:
            valid_from = self.instance.valid_from
        if valid_to is None and self.instance is not None:
            valid_to = self.instance.valid_to

        if "sick_leave_days" in attrs:
            sick_leave_days = attrs["sick_leave_days"]
        else:
            sick_leave_days = self.instance.sick_leave_days if self.instance else None

        if purpose == "illness":
            days = sick_leave_days
            if days is None and valid_from is not None and valid_to is not None:
                delta = (valid_to - valid_from).days + 1
                if delta >= 1:
                    attrs["sick_leave_days"] = delta
                    days = delta
            if days is None:
                raise serializers.ValidationError(
                    {"sick_leave_days": "Sick leave days are required for illness / sick leave certificates (enter explicitly or set a valid date range)."}
                )
            if days < 1 or days > 366:
                raise serializers.ValidationError(
                    {"sick_leave_days": "Sick leave days must be between 1 and 366."}
                )

        return attrs

    class Meta:
        model = MedicalCertificate
        fields = [
            "id",
            "certificate_number",
            "patient",
            "patient_name",
            "purpose",
            "valid_from",
            "valid_to",
            "sick_leave_days",
            "findings",
            "recommendations",
            "issued_by",
            "issued_by_name",
            "issued_at",
            "patient_name_snapshot",
            "patient_id_snapshot",
            "patient_category_snapshot",
            "doctor_name_snapshot",
        ]
        read_only_fields = [
            "id",
            "certificate_number",
            "issued_at",
            "issued_by",
            "issued_by_name",
            "patient_name_snapshot",
            "patient_id_snapshot",
            "patient_category_snapshot",
            "doctor_name_snapshot",
            "patient_name",
        ]
