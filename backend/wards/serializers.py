"""
Serializers for the Wards app.
"""
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from common.serializer_fields import OptionalUserPrimaryKeyField
from patients.photo import patient_photo_url
from .models import (
    Ward,
    Bed,
    PatientAdmission,
    WardAssignment,
    AdmissionObservationVital,
    AdmissionTreatmentRow,
    AdmissionEscort,
)


class WardSerializer(serializers.ModelSerializer):
    """Serializer for Ward model."""

    head_nurse_name = serializers.CharField(source='head_nurse.get_full_name', read_only=True)
    available_beds = serializers.IntegerField(read_only=True)
    occupancy_rate = serializers.FloatField(read_only=True)
    beds_count = serializers.SerializerMethodField()

    class Meta:
        model = Ward
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'occupied_beds']

    @extend_schema_field(OpenApiTypes.INT)
    def get_beds_count(self, obj):
        return obj.beds.count()


class BedSerializer(serializers.ModelSerializer):
    """Serializer for Bed model."""

    ward_name = serializers.CharField(source='ward.name', read_only=True)
    current_patient_name = serializers.CharField(source='current_patient.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = Bed
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class AdmissionEscortSerializer(serializers.ModelSerializer):
    """Serializer for AdmissionEscort — embedded under PatientAdmission and
    also exposed at its own endpoint so the nurse can confirm arrival /
    handover later."""

    primary_nurse_name = serializers.CharField(source='primary_nurse.get_full_name', read_only=True, allow_null=True)
    additional_nurse_names = serializers.SerializerMethodField()
    arrival_confirmed_by_name = serializers.CharField(
        source='arrival_confirmed_by.get_full_name', read_only=True, allow_null=True,
    )
    facility_name = serializers.CharField(source='facility.name', read_only=True, allow_null=True)
    referral_id_display = serializers.CharField(source='referral.referral_id', read_only=True, allow_null=True)
    referral_status = serializers.CharField(source='referral.status', read_only=True, allow_null=True)
    referral_urgency = serializers.CharField(source='referral.urgency', read_only=True, allow_null=True)
    # Full referral fields — exposed so the doctor's "Edit referral" dialog
    # can pre-fill without a second round-trip to the consultation app.
    referral_specialty = serializers.CharField(source='referral.specialty', read_only=True, allow_null=True)
    referral_reason = serializers.CharField(source='referral.reason', read_only=True, allow_null=True)
    referral_clinical_summary = serializers.CharField(source='referral.clinical_summary', read_only=True, allow_null=True)
    referral_facility_type = serializers.CharField(source='referral.facility_type', read_only=True, allow_null=True)
    referral_facility_partner = serializers.IntegerField(source='referral.facility_partner_id', read_only=True, allow_null=True)
    referral_contact_person = serializers.CharField(source='referral.contact_person', read_only=True, allow_null=True)
    referral_contact_phone = serializers.CharField(source='referral.contact_phone', read_only=True, allow_null=True)
    referral_contact_email = serializers.CharField(source='referral.contact_email', read_only=True, allow_null=True)
    referral_notes = serializers.CharField(source='referral.notes', read_only=True, allow_null=True)
    is_arrival_confirmed = serializers.SerializerMethodField()
    # Patient/admission context — needed in the nurse "leaving with us" queue
    # and the arrival-confirmation dialog where the escort is detached from
    # any visible admission row.
    patient_name = serializers.CharField(source='admission.patient.get_full_name', read_only=True)
    admission_display_id = serializers.CharField(source='admission.admission_id', read_only=True)
    ward_name = serializers.CharField(source='admission.ward.name', read_only=True)

    class Meta:
        model = AdmissionEscort
        fields = [
            'id',
            'admission',
            'admission_display_id',
            'patient_name',
            'ward_name',
            'referral',
            'referral_id_display',
            'referral_status',
            'referral_urgency',
            'referral_specialty',
            'referral_reason',
            'referral_clinical_summary',
            'referral_facility_type',
            'referral_facility_partner',
            'referral_contact_person',
            'referral_contact_phone',
            'referral_contact_email',
            'referral_notes',
            'facility',
            'facility_name',
            'facility_name_snapshot',
            'primary_nurse',
            'primary_nurse_name',
            'additional_nurses',
            'additional_nurse_names',
            'transport_mode',
            'departure_at',
            'handover_summary',
            'arrival_confirmed_at',
            'arrival_confirmed_by',
            'arrival_confirmed_by_name',
            'arrival_notes',
            'arrival_call_outcome',
            'is_arrival_confirmed',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'created_at',
            'updated_at',
            'arrival_confirmed_at',
            'arrival_confirmed_by',
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_additional_nurse_names(self, obj):
        return [u.get_full_name() for u in obj.additional_nurses.all()]

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_is_arrival_confirmed(self, obj):
        return obj.arrival_confirmed_at is not None


class PatientAdmissionSerializer(serializers.ModelSerializer):
    """Serializer for PatientAdmission model."""

    admitting_doctor = OptionalUserPrimaryKeyField()
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_photo = serializers.SerializerMethodField()
    ward_name = serializers.CharField(source='ward.name', read_only=True)
    bed_number = serializers.CharField(source='bed.bed_number', read_only=True, allow_null=True)
    admitting_doctor_name = serializers.CharField(source='admitting_doctor.get_full_name', read_only=True, allow_null=True)
    discharge_doctor_name = serializers.CharField(source='discharge_doctor.get_full_name', read_only=True, allow_null=True)
    confirmed_by_nurse_name = serializers.CharField(source='confirmed_by_nurse.get_full_name', read_only=True, allow_null=True)
    length_of_stay = serializers.IntegerField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    escort = AdmissionEscortSerializer(read_only=True)
    location_clinic_name = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.STR)
    def get_location_clinic_name(self, obj):
        from common.order_location import ward_clinic_name

        return ward_clinic_name(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_patient_photo(self, obj):
        return patient_photo_url(getattr(obj, 'patient', None))

    class Meta:
        model = PatientAdmission
        fields = '__all__'
        read_only_fields = ['admission_id', 'created_at', 'updated_at', 'created_by', 'discharge_date', 'ward_assignment']


class AdmissionObservationVitalSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source="recorded_by.get_full_name", read_only=True, allow_null=True)

    class Meta:
        model = AdmissionObservationVital
        fields = "__all__"
        read_only_fields = ["recorded_by", "recorded_by_name"]


class AdmissionTreatmentRowSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source="recorded_by.get_full_name", read_only=True, allow_null=True)

    class Meta:
        model = AdmissionTreatmentRow
        fields = "__all__"
        read_only_fields = ["created_at", "recorded_by", "recorded_by_name"]


class WardAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for WardAssignment model."""

    nurse_name = serializers.CharField(source='nurse.get_full_name', read_only=True)
    patient_name = serializers.CharField(source='admission.patient.get_full_name', read_only=True)
    ward_name = serializers.CharField(source='admission.ward.name', read_only=True)
    assigned_by_name = serializers.CharField(source='assigned_by.get_full_name', read_only=True, allow_null=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = WardAssignment
        fields = '__all__'
        read_only_fields = ['assigned_at', 'completed_at']