"""
Serializers for the Consultation app.
"""
from rest_framework import serializers
from django.db import IntegrityError
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from .models import (
    ConsultationRoom,
    ConsultationRoomOccupancy,
    ConsultationSession,
    ConsultationQueue,
    consultation_queue_priority_for_visit,
    Referral,
    ReferralFacility,
    ResponsibilityFormIssuance,
    Diagnosis,
    ICD10Code,
    PresentingComplaintCategory,
    PresentingComplaint,
)
from patients.serializers import PatientListSerializer, VitalReadingSerializer
from patients.photo import patient_photo_url
from .room_presence import get_active_occupancy, get_active_occupancies, get_doctor_occupancy, doctors_on_seat


class RoomDoctorPresenceSerializer(serializers.Serializer):
    doctor_id = serializers.IntegerField()
    doctor_name = serializers.CharField()
    presence_status = serializers.CharField()
    accepting_patients = serializers.BooleanField()
    active_session = serializers.DictField(allow_null=True)


class ConsultationRoomSerializer(serializers.ModelSerializer):
    """Serializer for ConsultationRoom model."""
    
    queue_count = serializers.SerializerMethodField()
    active_session = serializers.SerializerMethodField()
    active_sessions = serializers.SerializerMethodField()
    doctors = serializers.SerializerMethodField()
    doctors_on_seat_count = serializers.SerializerMethodField()
    occupancy_count = serializers.SerializerMethodField()
    my_presence_status = serializers.SerializerMethodField()
    my_accepting_patients = serializers.SerializerMethodField()
    clinic_name = serializers.CharField(source='clinic.name', read_only=True, allow_null=True)
    current_doctor_id = serializers.SerializerMethodField()
    current_doctor_name = serializers.SerializerMethodField()
    presence_status = serializers.SerializerMethodField()
    accepting_patients = serializers.SerializerMethodField()
    
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
        read_only_fields = [
            'created_at',
            'updated_at',
            'queue_count',
            'active_session',
            'active_sessions',
            'doctors',
            'doctors_on_seat_count',
            'occupancy_count',
            'my_presence_status',
            'my_accepting_patients',
            'clinic_name',
            'current_doctor_id',
            'current_doctor_name',
            'presence_status',
            'accepting_patients',
        ]
    
    def _active_occupancy(self, obj):
        request = self.context.get('request')
        if request and getattr(request.user, 'is_authenticated', False):
            mine = get_doctor_occupancy(obj, request.user)
            if mine is not None:
                return mine
        return get_active_occupancy(obj)

    def _active_sessions_qs(self, obj):
        prefetched = getattr(obj, '_active_sessions', None)
        if prefetched is not None:
            return prefetched
        return list(
            obj.sessions.filter(status='active').select_related('patient', 'doctor')
        )

    def _serialize_active_session(self, session):
        if not session:
            return None
        return {
            'id': session.id,
            'session_id': session.session_id,
            'patient_id': session.patient_id,
            'patient_name': session.patient.get_full_name(),
            'doctor_id': session.doctor_id,
            'doctor_name': session.doctor.get_full_name() if session.doctor else None,
        }

    @extend_schema_field(RoomDoctorPresenceSerializer(many=True))
    def get_doctors(self, obj):
        occupancies = get_active_occupancies(obj)
        active_sessions = {
            s.doctor_id: s
            for s in self._active_sessions_qs(obj)
            if s.doctor_id is not None
        }
        payload = []
        for occupancy in occupancies:
            session = active_sessions.get(occupancy.doctor_id)
            payload.append({
                'doctor_id': occupancy.doctor_id,
                'doctor_name': occupancy.doctor.get_full_name(),
                'presence_status': occupancy.status,
                'accepting_patients': occupancy.status == ConsultationRoomOccupancy.STATUS_ON_SEAT,
                'active_session': self._serialize_active_session(session),
            })
        return payload

    @extend_schema_field(OpenApiTypes.INT)
    def get_doctors_on_seat_count(self, obj):
        return sum(
            1
            for row in get_active_occupancies(obj)
            if row.status == ConsultationRoomOccupancy.STATUS_ON_SEAT
        )

    @extend_schema_field(OpenApiTypes.INT)
    def get_occupancy_count(self, obj):
        return len(get_active_occupancies(obj))

    @extend_schema_field(OpenApiTypes.STR)
    def get_my_presence_status(self, obj):
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return ConsultationRoomOccupancy.STATUS_AWAY
        occupancy = get_doctor_occupancy(obj, request.user)
        if occupancy is None:
            return ConsultationRoomOccupancy.STATUS_AWAY
        return occupancy.status

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_my_accepting_patients(self, obj):
        request = self.context.get('request')
        if not request or not getattr(request.user, 'is_authenticated', False):
            return False
        occupancy = get_doctor_occupancy(obj, request.user)
        return bool(
            occupancy and occupancy.status == ConsultationRoomOccupancy.STATUS_ON_SEAT
        )

    @extend_schema_field(OpenApiTypes.INT)
    def get_current_doctor_id(self, obj):
        occupancy = self._active_occupancy(obj)
        return occupancy.doctor_id if occupancy else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_current_doctor_name(self, obj):
        occupancy = self._active_occupancy(obj)
        if not occupancy:
            return None
        return occupancy.doctor.get_full_name()

    @extend_schema_field(OpenApiTypes.STR)
    def get_presence_status(self, obj):
        on_seat = doctors_on_seat(obj)
        if on_seat:
            return ConsultationRoomOccupancy.STATUS_ON_SEAT
        occupancies = get_active_occupancies(obj)
        if occupancies:
            return occupancies[0].status
        return ConsultationRoomOccupancy.STATUS_AWAY

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_accepting_patients(self, obj):
        return bool(doctors_on_seat(obj))
    
    @extend_schema_field(OpenApiTypes.INT)
    def get_queue_count(self, obj):
        """Get count of active queue items for this room."""
        return obj.queue_items.filter(is_active=True).count()
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_active_session(self, obj):
        """First active session in the room (backward compatible)."""
        active_session = next(iter(self._active_sessions_qs(obj)), None)
        return self._serialize_active_session(active_session)

    @extend_schema_field(OpenApiTypes.STR)
    def get_active_sessions(self, obj):
        return [self._serialize_active_session(s) for s in self._active_sessions_qs(obj)]


class ConsultationSessionSerializer(serializers.ModelSerializer):
    """Serializer for ConsultationSession model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    patient_age = serializers.IntegerField(source='patient.age', read_only=True)
    patient_age_display = serializers.CharField(source='patient.age_display', read_only=True)
    patient_gender = serializers.SerializerMethodField()
    patient_photo = serializers.SerializerMethodField()
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    room_name = serializers.CharField(source='room.name', read_only=True)
    clinic_name = serializers.CharField(source='visit.clinic', read_only=True, allow_null=True)
    location_clinic_name = serializers.SerializerMethodField()
    active_duration_seconds = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.STR)
    def get_location_clinic_name(self, obj):
        from common.order_location import location_clinic_name

        return location_clinic_name(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        v = getattr(instance, 'visit', None)
        data['visit_clinics'] = (getattr(v, 'clinics', None) or []) if v else []
        data['visit_type'] = getattr(v, 'visit_type', None) if v else None
        return data

    @extend_schema_field(OpenApiTypes.STR)
    def get_patient_gender(self, obj):
        p = getattr(obj, 'patient', None)
        if not p or not p.gender:
            return ''
        return p.get_gender_display()

    @extend_schema_field(OpenApiTypes.STR)
    def get_patient_photo(self, obj):
        return patient_photo_url(getattr(obj, 'patient', None))

    @extend_schema_field(OpenApiTypes.STR)
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

    @extend_schema_field(OpenApiTypes.STR)
    def get_patient_gender(self, obj):
        p = getattr(obj, 'patient', None)
        if not p or not p.gender:
            return ''
        return p.get_gender_display()

    @extend_schema_field(OpenApiTypes.STR)
    def get_visit_clinics(self, obj):
        """Get all clinics for this visit."""
        if not obj.visit:
            return []
        return getattr(obj.visit, 'clinics', []) or []
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_visit_completed_clinics(self, obj):
        """Get completed clinics for this visit."""
        if not obj.visit:
            return []
        return getattr(obj.visit, 'completed_clinics', []) or []

    @extend_schema_field(OpenApiTypes.STR)
    def get_latest_vitals(self, obj):
        visit = getattr(obj, 'visit', None)
        if not visit:
            return None

        vitals = list(getattr(visit, 'vital_readings', []).all())
        if not vitals:
            return None

        latest = max(vitals, key=lambda v: v.recorded_at or v.created_at)
        return VitalReadingSerializer(latest).data

    def validate(self, attrs):
        """Derive queue priority from visit type; ignore client-supplied tier values."""
        visit = attrs.get('visit')
        if visit is None and self.instance is not None:
            visit = self.instance.visit
        attrs['priority'] = consultation_queue_priority_for_visit(visit)
        return attrs

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


class ConsultationSessionByVisitSerializer(serializers.ModelSerializer):
    """Minimal fields for nursing pool: map visit → open consultation session."""

    room_name = serializers.CharField(source='room.name', read_only=True)
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = ConsultationSession
        fields = ['visit', 'room_name', 'status', 'doctor_name', 'started_at']

    def get_doctor_name(self, obj):
        if not obj.doctor:
            return ''
        return obj.doctor.get_full_name() or ''


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
    unstamped_responsibility_forms_count = serializers.SerializerMethodField()
    latest_responsibility_form = serializers.SerializerMethodField()
    facility_partner_detail = ReferralFacilityMiniSerializer(source='facility_partner', read_only=True)
    location_clinic_name = serializers.SerializerMethodField()
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_location_clinic_name(self, obj):
        from common.order_location import location_clinic_name

        if obj.session_id:
            return location_clinic_name(obj.session)
        return None

    class Meta:
        model = Referral
        fields = '__all__'
        read_only_fields = ['referral_id', 'referred_at', 'created_at']

    @extend_schema_field(OpenApiTypes.STR)
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

    @extend_schema_field(OpenApiTypes.INT)
    def get_unstamped_responsibility_forms_count(self, obj):
        return obj.responsibility_forms.filter(records_acknowledged_at__isnull=True).count()

    @extend_schema_field(OpenApiTypes.STR)
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

    @extend_schema_field(OpenApiTypes.STR)
    def get_records_acknowledged_by_name(self, obj):
        u = getattr(obj, 'records_acknowledged_by', None)
        if u is not None and hasattr(u, 'get_full_name'):
            return u.get_full_name()
        return None

    @extend_schema_field(OpenApiTypes.STR)
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
    patient_chart_id = serializers.CharField(source='patient.patient_id', read_only=True)
    diagnosed_by_name = serializers.CharField(source='diagnosed_by.get_full_name', read_only=True, allow_null=True)
    corrected_by_name = serializers.CharField(source='corrected_by.get_full_name', read_only=True, allow_null=True)
    icd10_code_details = serializers.SerializerMethodField()
    original_icd10_code_details = serializers.SerializerMethodField()
    session_status = serializers.CharField(source='session.status', read_only=True, allow_null=True)
    visit_date = serializers.DateField(source='visit.date', read_only=True, allow_null=True)

    class Meta:
        model = Diagnosis
        fields = '__all__'
        read_only_fields = [
            'diagnosed_at',
            'original_icd10_code',
            'corrected_by',
            'corrected_at',
            'correction_reason',
            'correction_notes',
        ]
        validators = []

    def _duplicate_visit_diagnosis_exists(self, *, patient, visit, icd10_code, exclude_pk=None):
        patient_id = getattr(patient, 'pk', patient)
        icd10_code_id = getattr(icd10_code, 'pk', icd10_code)
        visit_id = getattr(visit, 'pk', visit) if visit is not None else None

        qs = Diagnosis.objects.filter(
            patient_id=patient_id,
            icd10_code_id=icd10_code_id,
        )
        if visit_id is None:
            qs = qs.filter(visit__isnull=True)
        else:
            qs = qs.filter(visit_id=visit_id)
        if exclude_pk is not None:
            qs = qs.exclude(pk=exclude_pk)
        return qs.exists()

    def validate(self, attrs):
        patient = attrs.get('patient') or getattr(self.instance, 'patient', None)
        visit = attrs.get('visit', getattr(self.instance, 'visit', None) if self.instance else None)
        icd10_code = attrs.get('icd10_code') or getattr(self.instance, 'icd10_code', None)

        if patient is not None and icd10_code is not None:
            exclude_pk = self.instance.pk if self.instance else None
            if self._duplicate_visit_diagnosis_exists(
                patient=patient,
                visit=visit,
                icd10_code=icd10_code,
                exclude_pk=exclude_pk,
            ):
                raise serializers.ValidationError(
                    {'icd10_code': 'This ICD-10 code is already recorded for this visit.'}
                )
        return attrs

    def create(self, validated_data):
        try:
            return super().create(validated_data)
        except IntegrityError as exc:
            if 'diagnoses' in str(exc).lower() or 'unique' in str(exc).lower():
                raise serializers.ValidationError(
                    {'icd10_code': 'This ICD-10 code is already recorded for this visit.'}
                ) from exc
            raise

    def _icd10_details(self, icd):
        if not icd:
            return None
        return {
            'code': icd.code,
            'description': icd.description,
            'category': icd.category,
        }

    @extend_schema_field(OpenApiTypes.STR)
    def get_icd10_code_details(self, obj):
        """Get full ICD-10 code details."""
        return self._icd10_details(obj.icd10_code)

    @extend_schema_field(OpenApiTypes.STR)
    def get_original_icd10_code_details(self, obj):
        """Get original ICD-10 code details before records correction."""
        return self._icd10_details(obj.original_icd10_code)


class DiagnosisCorrectionSerializer(serializers.Serializer):
    """Payload for records staff ICD-10 coding corrections."""

    icd10_code = serializers.PrimaryKeyRelatedField(queryset=ICD10Code.objects.filter(is_active=True))
    reason = serializers.ChoiceField(choices=Diagnosis.CORRECTION_REASON_CHOICES)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)


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

    @extend_schema_field(OpenApiTypes.STR)
    def get_complaints(self, obj):
        include_complaints = bool(self.context.get('include_complaints'))
        if not include_complaints:
            return None

        queryset = obj.complaints.all().order_by('sort_order', 'label')
        if self.context.get('active_only'):
            queryset = queryset.filter(is_active=True)

        return PresentingComplaintSerializer(queryset, many=True, context=self.context).data
