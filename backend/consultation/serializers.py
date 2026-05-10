"""
Serializers for the Consultation app.
"""
from rest_framework import serializers
from .models import (
    ConsultationRoom,
    ConsultationSession,
    ConsultationQueue,
    Referral,
    ReferralFacility,
    ResponsibilityFormIssuance,
    Diagnosis,
    ICD10Code,
    PresentingComplaintCategory,
    PresentingComplaint,
)
from patients.serializers import PatientListSerializer, VitalReadingSerializer


class ConsultationRoomSerializer(serializers.ModelSerializer):
    """Serializer for ConsultationRoom model."""
    
    queue_count = serializers.SerializerMethodField()
    active_session = serializers.SerializerMethodField()
    clinic_name = serializers.CharField(source='clinic.name', read_only=True, allow_null=True)
    
    def _resolve_clinic_from_location(self, location_str):
        """Resolve clinic FK from location string when it matches a Clinic name."""
        if not location_str:
            return None
        try:
            from organization.models import Clinic
            return Clinic.objects.filter(name=location_str, is_active=True).first()
        except Exception:
            return None

    def create(self, validated_data):
        location_str = validated_data.get('location')
        if location_str and validated_data.get('clinic') is None:
            clinic = self._resolve_clinic_from_location(location_str)
            if clinic:
                validated_data['clinic'] = clinic
        return super().create(validated_data)

    def update(self, instance, validated_data):
        location_str = validated_data.get('location', instance.location)
        if location_str and 'clinic' not in validated_data:
            clinic = self._resolve_clinic_from_location(location_str)
            validated_data['clinic'] = clinic
        return super().update(instance, validated_data)
    
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
    patient_age_display = serializers.CharField(source='patient.age_display', read_only=True)
    patient_gender = serializers.SerializerMethodField()
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    clinic_name = serializers.CharField(source='visit.clinic', read_only=True, allow_null=True)
    active_duration_seconds = serializers.SerializerMethodField()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        v = getattr(instance, 'visit', None)
        data['visit_clinics'] = (getattr(v, 'clinics', None) or []) if v else []
        return data

    def get_patient_gender(self, obj):
        p = getattr(obj, 'patient', None)
        if not p or not p.gender:
            return ''
        return p.get_gender_display()

    def get_active_duration_seconds(self, obj):
        if hasattr(obj, 'get_active_duration_seconds'):
            return obj.get_active_duration_seconds()
        return 0
    
    class Meta:
        model = ConsultationSession
        fields = '__all__'
        read_only_fields = ['session_id', 'started_at', 'created_at']
        # DRF partial-update bug with conditional UniqueConstraint can raise KeyError
        # when fields used by constraint condition (e.g. "status") are absent in PATCH payload.
        # Keep DB constraints as source of truth; viewset create/update handles IntegrityError.
        validators = []


class ConsultationQueueSerializer(serializers.ModelSerializer):
    """Serializer for ConsultationQueue model."""

    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    patient_age = serializers.IntegerField(source='patient.age', read_only=True)
    patient_age_display = serializers.CharField(source='patient.age_display', read_only=True)
    patient_gender = serializers.SerializerMethodField()
    patient_details = PatientListSerializer(source='patient', read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    visit_display_id = serializers.CharField(source='visit.visit_id', read_only=True, allow_null=True)
    visit_date = serializers.DateField(source='visit.date', read_only=True, allow_null=True)
    visit_time = serializers.TimeField(source='visit.time', read_only=True, allow_null=True)
    visit_type = serializers.CharField(source='visit.visit_type', read_only=True, allow_null=True)
    visit_status = serializers.CharField(source='visit.status', read_only=True, allow_null=True)
    visit_clinic = serializers.CharField(source='visit.clinic', read_only=True, allow_null=True)
    visit_clinics = serializers.SerializerMethodField()  # All clinics for this visit
    visit_completed_clinics = serializers.SerializerMethodField()  # Completed clinics
    latest_vitals = serializers.SerializerMethodField()

    def get_patient_gender(self, obj):
        p = getattr(obj, 'patient', None)
        if not p or not p.gender:
            return ''
        return p.get_gender_display()

    def get_visit_clinics(self, obj):
        """Get all clinics for this visit."""
        if not obj.visit:
            return []
        return getattr(obj.visit, 'clinics', []) or []
    
    def get_visit_completed_clinics(self, obj):
        """Get completed clinics for this visit."""
        if not obj.visit:
            return []
        return getattr(obj.visit, 'completed_clinics', []) or []

    def get_latest_vitals(self, obj):
        visit = getattr(obj, 'visit', None)
        if not visit:
            return None

        vitals = list(getattr(visit, 'vital_readings', []).all())
        if not vitals:
            return None

        latest = max(vitals, key=lambda v: v.recorded_at or v.created_at)
        return VitalReadingSerializer(latest).data

    class Meta:
        model = ConsultationQueue
        fields = [
            'id', 'room', 'patient', 'visit', 'priority', 'notes', 'queued_at',
            'called_at', 'is_active',
            # Read-only fields
            'patient_name', 'patient_id', 'patient_age', 'patient_age_display', 'patient_gender',
            'room_name', 'visit_display_id', 'visit_date',
            'visit_time', 'visit_type', 'visit_status', 'visit_clinic',
            'visit_clinics', 'visit_completed_clinics',  # Multi-clinic support
            'patient_details', 'latest_vitals',
        ]
        read_only_fields = ['queued_at', 'id']
        # Disable model validators - we handle unique constraints manually in perform_update
        validators = []


class ConsultationQueueByVisitSerializer(serializers.ModelSerializer):
    """Minimal fields for nursing pool: map visit → active room queue row."""

    room_name = serializers.CharField(source='room.name', read_only=True)

    class Meta:
        model = ConsultationQueue
        fields = ['visit', 'room_name', 'queued_at']


class ReferralFacilitySerializer(serializers.ModelSerializer):
    """Catalog of partner / receiving facilities for referrals."""

    class Meta:
        model = ReferralFacility
        fields = [
            'id',
            'name',
            'code',
            'facility_type',
            'phone',
            'email',
            'address',
            'contact_person_title',
            'specialties',
            'notes',
            'is_active',
            'sort_order',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ReferralFacilityMiniSerializer(serializers.ModelSerializer):
    """Compact embed used inside ``ReferralSerializer.facility_partner``."""

    class Meta:
        model = ReferralFacility
        fields = [
            'id',
            'name',
            'code',
            'facility_type',
            'address',
            'contact_person_title',
            'is_active',
        ]


class ReferralSerializer(serializers.ModelSerializer):
    """Serializer for Referral model."""

    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    referred_by_name = serializers.CharField(source='referred_by.get_full_name', read_only=True, allow_null=True)
    referral_letter_acknowledged_by_name = serializers.SerializerMethodField()
    responsibility_forms_count = serializers.IntegerField(source='responsibility_forms.count', read_only=True)
    latest_responsibility_form = serializers.SerializerMethodField()
    facility_partner_detail = ReferralFacilityMiniSerializer(source='facility_partner', read_only=True)

    class Meta:
        model = Referral
        fields = '__all__'
        read_only_fields = ['referral_id', 'referred_at', 'created_at']

    def get_referral_letter_acknowledged_by_name(self, obj):
        u = getattr(obj, 'referral_letter_acknowledged_by', None)
        if u is not None and hasattr(u, 'get_full_name'):
            return u.get_full_name()
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Real patient fields only (no derived/fallback values) for referral / form print.
        data['patient_print_pn'] = self.get_patient_print_pn(instance)
        data['patient_print_dept'] = self.get_patient_print_dept(instance)
        return data

    def get_patient_print_pn(self, obj):
        """Stored personal_number, or principal's when patient is a dependent and has no own number."""
        p = getattr(obj, 'patient', None)
        if not p:
            return ''
        own = (p.personal_number or '').strip()
        if own:
            return own
        if p.category == 'dependent':
            principal = getattr(p, 'principal_staff', None)
            if principal:
                return (principal.personal_number or '').strip()
        return ''

    def get_patient_print_dept(self, obj):
        """Stored division, or principal's when dependent has no own division."""
        p = getattr(obj, 'patient', None)
        if not p:
            return ''
        own = (p.division or '').strip()
        if own:
            return own
        if p.category == 'dependent':
            principal = getattr(p, 'principal_staff', None)
            if principal:
                return (principal.division or '').strip()
        return ''

    def get_latest_responsibility_form(self, obj):
        latest = obj.responsibility_forms.order_by('-issue_date').first()
        if not latest:
            return None
        return {
            'id': latest.id,
            'sequence_number': latest.sequence_number,
            'valid_from': latest.valid_from,
            'valid_to': latest.valid_to,
            'status': latest.status,
            'issue_date': latest.issue_date,
            'document_file': latest.document_file.url if latest.document_file else None,
        }


class ResponsibilityFormIssuanceSerializer(serializers.ModelSerializer):
    """Serializer for responsibility form issuances."""

    issued_by_name = serializers.CharField(source='issued_by.get_full_name', read_only=True, allow_null=True)
    records_acknowledged_by_name = serializers.SerializerMethodField()
    referral_id_display = serializers.CharField(source='referral.referral_id', read_only=True)
    document_file_url = serializers.SerializerMethodField()

    class Meta:
        model = ResponsibilityFormIssuance
        fields = '__all__'
        read_only_fields = [
            'sequence_number',
            'issue_date',
            'created_at',
            'updated_at',
            'issued_by',
            'records_acknowledged_at',
            'records_acknowledged_by',
        ]

    def get_records_acknowledged_by_name(self, obj):
        u = getattr(obj, 'records_acknowledged_by', None)
        if u is not None and hasattr(u, 'get_full_name'):
            return u.get_full_name()
        return None

    def get_document_file_url(self, obj):
        return obj.document_file.url if obj.document_file else None


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


class PresentingComplaintSerializer(serializers.ModelSerializer):
    """Serializer for presenting complaint library items."""

    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = PresentingComplaint
        fields = '__all__'


class PresentingComplaintCategorySerializer(serializers.ModelSerializer):
    """Serializer for presenting complaint categories."""

    complaints = serializers.SerializerMethodField()
    complaint_count = serializers.IntegerField(read_only=True)
    active_complaint_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PresentingComplaintCategory
        fields = '__all__'

    def get_complaints(self, obj):
        include_complaints = bool(self.context.get('include_complaints'))
        if not include_complaints:
            return None

        queryset = obj.complaints.all().order_by('sort_order', 'label')
        if self.context.get('active_only'):
            queryset = queryset.filter(is_active=True)

        return PresentingComplaintSerializer(queryset, many=True, context=self.context).data
