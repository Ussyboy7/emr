from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes

from patients.models import AnnualCheckupExemption


class HRComplianceRowSerializer(serializers.Serializer):
    patient_id = serializers.IntegerField()
    patient_display_id = serializers.CharField()
    personal_number = serializers.CharField()
    full_name = serializers.CharField()
    division = serializers.CharField()
    location = serializers.CharField()
    location_clinic_name = serializers.CharField()
    programme_year = serializers.IntegerField()
    compliance_status = serializers.CharField()
    annual_checkup_id = serializers.IntegerField(allow_null=True)
    visit_id = serializers.CharField(allow_null=True)
    visit_date = serializers.CharField(allow_null=True)
    fitness_outcome = serializers.CharField()
    fitness_outcome_display = serializers.CharField()
    outcome_notes = serializers.CharField()
    signed_off_at = serializers.CharField(allow_null=True)
    has_outcome_letter = serializers.BooleanField()
    exemption_reason = serializers.CharField()
    exemption_notes = serializers.CharField()


class AnnualCheckupExemptionSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.get_full_name", read_only=True)
    patient_display_id = serializers.CharField(source="patient.patient_id", read_only=True)
    granted_by_name = serializers.SerializerMethodField()
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)

    @extend_schema_field(OpenApiTypes.STR)
    def get_granted_by_name(self, obj):
        user = getattr(obj, "granted_by", None)
        if not user:
            return None
        return user.get_full_name() or user.username

    class Meta:
        model = AnnualCheckupExemption
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_display_id",
            "programme_year",
            "reason",
            "reason_display",
            "notes",
            "granted_by",
            "granted_by_name",
            "granted_at",
            "expires_at",
        ]
        read_only_fields = ["id", "granted_by", "granted_at"]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["granted_by"] = request.user
        return super().create(validated_data)
