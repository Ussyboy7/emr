"""
Serializers for the Patients app.
"""
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from .photo import patient_photo_url
from .models import Patient, Visit, VitalReading, MedicalHistory, MedicalCertificate, AnnualCheckup, PatientRecordsNote, PatientClinicalDocument


def _patient_photo_url(obj) -> str | None:
    return patient_photo_url(obj)


class PatientSerializer(serializers.ModelSerializer):
    """Serializer for Patient model."""
    
    full_name = serializers.SerializerMethodField()
    age = serializers.IntegerField(read_only=True)
    age_display = serializers.CharField(read_only=True)
    photo = serializers.ImageField(required=False, allow_null=True)
    clear_photo = serializers.BooleanField(required=False, write_only=True, default=False)
    records_note = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
        max_length=800,
        help_text="Optional Medical Records note captured at registration.",
    )
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.STR)
    def get_created_by_name(self, obj):
        user = getattr(obj, 'created_by', None)
        if not user:
            return None
        try:
            return user.get_full_name() or getattr(user, 'username', None) or str(user)
        except (AttributeError, TypeError):
            return str(user) if user else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_updated_by_name(self, obj):
        user = getattr(obj, 'updated_by', None)
        if not user:
            return None
        try:
            return user.get_full_name() or getattr(user, 'username', None) or str(user)
        except (AttributeError, TypeError):
            return str(user) if user else None

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
            'created_at', 'updated_at', 'created_by_name', 'updated_by_name', 'is_active',
            'is_first_time_patient',
            'clear_photo', 'records_note',
        ]
        read_only_fields = ['id', 'patient_id', 'created_at', 'updated_at', 'age']
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_full_name(self, obj):
        return obj.get_full_name()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['photo'] = _patient_photo_url(instance)
        return data

    def validate_photo(self, value):
        if value is None:
            return value
        from common.upload_validation import UploadValidationError, validate_upload_file

        try:
            validate_upload_file(value)
        except UploadValidationError as exc:
            raise serializers.ValidationError(str(exc)) from exc
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
        validated_data.pop('clear_photo', None)
        records_note = (validated_data.pop('records_note', None) or '').strip()
        location_str = validated_data.get('location')
        if location_str and validated_data.get('location_clinic') is None:
            clinic = self._resolve_location_clinic(location_str)
            if clinic:
                validated_data['location_clinic'] = clinic
        patient = super().create(validated_data)
        if records_note:
            request = self.context.get('request')
            user = getattr(request, 'user', None) if request else None
            name = ''
            if user and getattr(user, 'is_authenticated', False):
                try:
                    name = user.get_full_name() or getattr(user, 'username', '') or ''
                except Exception:
                    name = str(user)
            PatientRecordsNote.objects.create(
                patient=patient,
                note=records_note[:800],
                source='registration',
                recorded_by=user if user and getattr(user, 'is_authenticated', False) else None,
                recorded_by_name_snapshot=name,
            )
        return patient

    def update(self, instance, validated_data):
        clear_photo = validated_data.pop('clear_photo', False)
        validated_data.pop('records_note', None)
        new_photo = validated_data.get('photo')
        if new_photo:
            clear_photo = False
        elif clear_photo and instance.photo:
            instance.photo.delete(save=False)
            validated_data['photo'] = None

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

        if self.instance and self.instance.category == 'employee':
            old_type = (self.instance.employee_type or '').strip().lower()
            new_type = (attrs.get('employee_type', self.instance.employee_type) or '').strip().lower()
            if old_type == 'staff' and new_type == 'officer':
                raise serializers.ValidationError({
                    'employee_type': (
                        'Use Promote to Officer so linked dependents receive updated patient IDs.'
                    ),
                })

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
    age = serializers.IntegerField(read_only=True)
    age_display = serializers.CharField(read_only=True)
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
            'employee_type', 'location', 'division',
        ]
        read_only_fields = ['id', 'patient_id', 'created_at', 'age']

    @extend_schema_field(OpenApiTypes.STR)
    def get_full_name(self, obj):
        return obj.get_full_name()

    @extend_schema_field(OpenApiTypes.STR)
    def get_gender(self, obj):
        return obj.get_gender_display() if obj.gender else ''

    @extend_schema_field(OpenApiTypes.STR)
    def get_principal_staff_full_name(self, obj):
        p = getattr(obj, 'principal_staff', None)
        if p is None:
            return ''
        return p.get_full_name()

    @extend_schema_field(OpenApiTypes.STR)
    def get_principal_staff_patient_id(self, obj):
        p = getattr(obj, 'principal_staff', None)
        if p is None:
            return ''
        return (p.patient_id or '').strip()

    @extend_schema_field(OpenApiTypes.STR)
    def get_principal_staff_category(self, obj):
        p = getattr(obj, 'principal_staff', None)
        if p is None:
            return ''
        return p.category or ''

    @extend_schema_field(OpenApiTypes.STR)
    def get_photo(self, obj):
        return _patient_photo_url(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_total_visits(self, obj):
        annotated = getattr(obj, '_total_visits', None)
        if annotated is not None:
            return annotated
        return obj.visits.count()

    @extend_schema_field(OpenApiTypes.STR)
    def get_last_visit_at(self, obj):
        last_date = getattr(obj, '_last_visit_date', None)
        last_time = getattr(obj, '_last_visit_time', None)
        if hasattr(obj, '_last_visit_date'):
            if last_date is None or last_time is None:
                return None
            return f"{last_date}T{last_time}"
        last_visit = obj.visits.order_by('-date', '-time', '-created_at').first()
        if not last_visit:
            return None
        return f"{last_visit.date}T{last_visit.time}"
    


class VisitSerializer(serializers.ModelSerializer):
    """Serializer for Visit model."""

    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    age = serializers.IntegerField(source='patient.age', read_only=True)
    gender = serializers.SerializerMethodField()
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    created_by_name = serializers.SerializerMethodField()
    location_clinic_name = serializers.SerializerMethodField()
    is_new_registration = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.STR)
    def get_location_clinic_name(self, obj):
        clinic = getattr(obj, 'location_clinic', None)
        return clinic.name if clinic else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_created_by_name(self, obj):
        user = getattr(obj, 'created_by', None)
        if not user:
            return None
        try:
            return user.get_full_name() or getattr(user, 'username', None) or str(user)
        except (AttributeError, TypeError):
            return str(user) if user else None
    is_first_visit = serializers.SerializerMethodField()
    is_returning_visit = serializers.SerializerMethodField()
    patient_visit_status = serializers.SerializerMethodField()
    patient_photo = serializers.SerializerMethodField()
    vitals = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.STR)
    def get_gender(self, obj):
        patient = getattr(obj, 'patient', None)
        if not patient or not patient.gender:
            return ''
        return patient.get_gender_display()
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_vitals(self, obj):
        """Get the most recent vital reading for this visit."""
        prefetched = getattr(obj, '_latest_vital_readings', None)
        vital = prefetched[0] if prefetched else obj.vital_readings.first()
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

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_is_new_registration(self, obj):
        patient = getattr(obj, 'patient', None)
        if not patient or not patient.created_at:
            return False
        return patient.created_at.date() == obj.date

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_is_first_visit(self, obj):
        annotated_first_visit_id = getattr(obj, 'first_visit_id', None)
        if annotated_first_visit_id is not None:
            return annotated_first_visit_id == obj.id

        first_visit = obj.patient.visits.order_by('date', 'time', 'created_at', 'id').values_list('id', flat=True).first()
        return first_visit == obj.id

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_is_returning_visit(self, obj):
        return not self.get_is_first_visit(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_patient_visit_status(self, obj):
        if self.get_is_first_visit(obj):
            return 'First Visit'
        if self.get_is_new_registration(obj):
            return 'Newly Registered'
        return 'Returning'

    @extend_schema_field(OpenApiTypes.STR)
    def get_patient_photo(self, obj):
        return _patient_photo_url(getattr(obj, 'patient', None))
    
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

        visit_type = attrs.get('visit_type', self.instance.visit_type if self.instance else None)
        if visit_type == 'annual_checkup' and patient:
            if patient.category != 'employee':
                raise serializers.ValidationError({
                    'visit_type': 'Annual check-ups are only for employee patients.',
                })
            if not patient.is_active:
                raise serializers.ValidationError({
                    'visit_type': 'Annual check-ups require an active employee patient.',
                })

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
            'id', 'visit_id', 'patient', 'patient_id', 'patient_name', 'patient_photo', 'age', 'gender', 'visit_type', 'status',
            'date', 'time', 'clinic', 'clinics', 'completed_clinics', 'location', 'location_clinic', 'location_clinic_name', 'doctor', 'doctor_name',
            'clinical_notes', 'vitals',
            'is_new_registration', 'is_first_visit', 'is_returning_visit', 'patient_visit_status',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'visit_id', 'created_by', 'created_by_name', 'created_at', 'updated_at', 'vitals', 'age', 'gender']
        extra_kwargs = {
            'clinics': {'required': False},
            'completed_clinics': {'required': False},
        }


class VitalReadingSerializer(serializers.ModelSerializer):
    """Serializer for VitalReading model."""

    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    patient_photo = serializers.SerializerMethodField()
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True, allow_null=True)
    location_clinic_name = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.STR)
    def get_location_clinic_name(self, obj):
        from common.order_location import location_clinic_name

        visit = getattr(obj, "visit", None)
        return location_clinic_name(visit)

    @extend_schema_field(OpenApiTypes.STR)
    def get_patient_photo(self, obj):
        return _patient_photo_url(getattr(obj, 'patient', None))

    class Meta:
        model = VitalReading
        fields = [
            'id', 'visit', 'patient', 'patient_id', 'patient_name', 'patient_photo',
            'temperature', 'blood_pressure_systolic', 'blood_pressure_diastolic',
            'heart_rate', 'respiratory_rate', 'oxygen_saturation',
            'weight', 'height', 'bmi', 'pain_scale', 'blood_sugar', 'random_blood_sugar',
            'notes', 'recorded_at', 'recorded_by', 'recorded_by_name',
            'location_clinic_name',
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


class AnnualCheckupSerializer(serializers.ModelSerializer):
    """Read/update serializer for annual check-up records."""

    patient_name = serializers.CharField(source="patient.get_full_name", read_only=True)
    patient_id = serializers.CharField(source="patient.patient_id", read_only=True)
    visit_id = serializers.CharField(source="visit.visit_id", read_only=True)
    visit_date = serializers.DateField(source="visit.date", read_only=True)
    visit_status = serializers.CharField(source="visit.status", read_only=True)
    signed_off_by_name = serializers.SerializerMethodField()
    fitness_outcome_display = serializers.CharField(
        source="get_fitness_outcome_display", read_only=True
    )
    checklist = serializers.SerializerMethodField()
    catalog = serializers.SerializerMethodField()
    incomplete_components = serializers.SerializerMethodField()
    has_report_pdf = serializers.SerializerMethodField()
    has_outcome_letter = serializers.SerializerMethodField()
    next_due_date = serializers.DateField(read_only=True)

    @extend_schema_field(OpenApiTypes.STR)
    def get_signed_off_by_name(self, obj):
        user = getattr(obj, "signed_off_by", None)
        if not user:
            return None
        try:
            return user.get_full_name() or getattr(user, "username", None)
        except (AttributeError, TypeError):
            return str(user)

    @extend_schema_field(OpenApiTypes.STR)
    def get_checklist(self, obj):
        from .annual_checkup_services import build_component_checklist

        return build_component_checklist(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_catalog(self, obj):
        from .annual_checkup_services import build_full_catalog_with_selection

        return build_full_catalog_with_selection(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_incomplete_components(self, obj):
        from .annual_checkup_services import evaluate_components

        _, incomplete = evaluate_components(obj)
        return incomplete

    @extend_schema_field(OpenApiTypes.STR)
    def get_has_report_pdf(self, obj):
        return bool(obj.report_pdf)

    @extend_schema_field(OpenApiTypes.STR)
    def get_has_outcome_letter(self, obj):
        return bool(obj.outcome_letter_pdf)

    class Meta:
        model = AnnualCheckup
        fields = [
            "id",
            "visit",
            "visit_id",
            "visit_date",
            "visit_status",
            "patient",
            "patient_id",
            "patient_name",
            "programme_year",
            "status",
            "fitness_outcome",
            "fitness_outcome_display",
            "outcome_notes",
            "signed_off_by",
            "signed_off_by_name",
            "signed_off_at",
            "sign_off_override_reason",
            "components_required",
            "components_completed",
            "component_overrides",
            "checklist",
            "catalog",
            "incomplete_components",
            "has_report_pdf",
            "has_outcome_letter",
            "next_due_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "patient",
            "programme_year",
            "status",
            "signed_off_by",
            "signed_off_at",
            "sign_off_override_reason",
            "components_completed",
            "checklist",
            "catalog",
            "incomplete_components",
            "has_report_pdf",
            "has_outcome_letter",
            "next_due_date",
            "created_at",
            "updated_at",
        ]


class AnnualCheckupSignOffSerializer(serializers.Serializer):
    fitness_outcome = serializers.ChoiceField(
        choices=AnnualCheckup.FITNESS_OUTCOME_CHOICES
    )
    outcome_notes = serializers.CharField(required=False, allow_blank=True, default="")
    override_reason = serializers.CharField(required=False, allow_blank=True, default="")


class AnnualCheckupCreateSerializer(serializers.Serializer):
    """Create an annual check-up wrapper for an existing visit."""

    visit = serializers.PrimaryKeyRelatedField(queryset=Visit.objects.all())
    programme_year = serializers.IntegerField(required=False, min_value=2000, max_value=2100)


class AnnualCheckupProgrammeSerializer(serializers.Serializer):
    programme_year = serializers.IntegerField()
    catalog = serializers.ListField(child=serializers.DictField(), read_only=True)
    default_selected_codes = serializers.ListField(
        child=serializers.CharField(max_length=50)
    )


class AnnualCheckupOrderInvestigationsSerializer(serializers.Serializer):
    consultation_session = serializers.IntegerField(required=False)
    component_codes = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
    )
    priority = serializers.ChoiceField(
        choices=["routine", "urgent", "stat"],
        default="routine",
        required=False,
    )


class PatientRecordsNoteSerializer(serializers.ModelSerializer):
    """Append-only Medical Records administrative notes."""

    class Meta:
        model = PatientRecordsNote
        fields = [
            "id",
            "patient",
            "note",
            "source",
            "recorded_by",
            "recorded_by_name_snapshot",
            "recorded_at",
        ]
        read_only_fields = [
            "id",
            "patient",
            "source",
            "recorded_by",
            "recorded_by_name_snapshot",
            "recorded_at",
        ]


class PatientClinicalDocumentSerializer(serializers.ModelSerializer):
    """Scanned / external clinical documents on the patient chart."""

    referral_id_display = serializers.SerializerMethodField()
    doc_type_display = serializers.CharField(source="get_doc_type_display", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)

    class Meta:
        model = PatientClinicalDocument
        fields = [
            "id",
            "patient",
            "doc_type",
            "doc_type_display",
            "source",
            "source_display",
            "document_date",
            "title",
            "facility",
            "clinician_name",
            "notes",
            "file",
            "original_filename",
            "referral",
            "referral_id_display",
            "uploaded_by",
            "uploaded_by_name_snapshot",
            "uploaded_at",
        ]
        read_only_fields = [
            "id",
            "patient",
            "original_filename",
            "uploaded_by",
            "uploaded_by_name_snapshot",
            "uploaded_at",
            "doc_type_display",
            "source_display",
            "referral_id_display",
        ]

    def get_referral_id_display(self, obj) -> str | None:
        if obj.referral_id and obj.referral:
            return obj.referral.referral_id
        return None

    def validate_file(self, value):
        if value in (None, ""):
            raise serializers.ValidationError("File is required.")
        from common.upload_validation import UploadValidationError, validate_upload_file, sanitize_upload_filename

        try:
            validate_upload_file(value)
        except UploadValidationError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        # Normalize filename for storage / display
        name = sanitize_upload_filename(getattr(value, "name", None) or "document.pdf")
        value.name = name
        return value

    def validate_doc_type(self, value):
        allowed = {c[0] for c in PatientClinicalDocument.DOC_TYPE_CHOICES}
        if value not in allowed:
            raise serializers.ValidationError("Invalid document type.")
        return value

    def validate_source(self, value):
        allowed = {c[0] for c in PatientClinicalDocument.SOURCE_CHOICES}
        if value not in allowed:
            raise serializers.ValidationError("Invalid source.")
        return value
