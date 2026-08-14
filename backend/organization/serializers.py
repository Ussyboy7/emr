"""
Serializers for the Organization app.
"""
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from .models import Clinic, Department, Room, OutpatientClinicType, WorkLocation, SystemConfig


class ClinicSerializer(serializers.ModelSerializer):
    """Serializer for Clinic model."""
    
    staff_count = serializers.SerializerMethodField()
    room_count = serializers.SerializerMethodField()
    head_name = serializers.SerializerMethodField()
    patient_count = serializers.SerializerMethodField()
    doctor_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Clinic
        fields = [
            "id",
            "name",
            "code",
            "description",
            "location",
            "phone",
            "email",
            "is_active",
            "default_processing_clinic",
            "created_at",
            "updated_at",
            "staff_count",
            "room_count",
            "head_name",
            "patient_count",
            "doctor_count",
        ]
        read_only_fields = [
            "created_at",
            "updated_at",
            "staff_count",
            "room_count",
            "head_name",
            "patient_count",
            "doctor_count",
        ]
    
    @extend_schema_field(OpenApiTypes.INT)
    def get_staff_count(self, obj):
        """Get count of staff assigned to this clinic (via M2M)."""
        v = getattr(obj, "staff_count", None)
        if v is not None:
            return v
        return obj.assigned_staff.filter(is_active=True).count()
    
    @extend_schema_field(OpenApiTypes.INT)
    def get_room_count(self, obj):
        """Get count of rooms assigned to this clinic.
        Includes both organization.Room and consultation.ConsultationRoom.
        """
        from consultation.models import ConsultationRoom
        org_rooms_count = getattr(obj, "org_room_count", None)
        if org_rooms_count is None:
            org_rooms_count = obj.rooms.filter(is_active=True).count()
        consult_rooms_count = ConsultationRoom.objects.filter(location_clinic=obj, is_active=True).count()
        return org_rooms_count + consult_rooms_count
    
    @extend_schema_field(OpenApiTypes.STR)
    def get_head_name(self, obj):
        """Get the name of the clinic head (if any department head exists)."""
        # For now, return None as Clinic doesn't have a direct head field
        # Could be implemented if needed
        return None

    @extend_schema_field(OpenApiTypes.INT)
    def get_patient_count(self, obj):
        """Patients with default clinic (location_clinic); from annotate when listing."""
        v = getattr(obj, "patient_count", None)
        return v if v is not None else 0

    @extend_schema_field(OpenApiTypes.INT)
    def get_doctor_count(self, obj):
        """Active doctors assigned to this clinic; from annotate when listing."""
        v = getattr(obj, "doctor_count", None)
        return v if v is not None else 0


class ClinicLightSerializer(serializers.ModelSerializer):
    """Minimal clinic payload for switchers/filters: no aggregate counts."""

    class Meta:
        model = Clinic
        fields = ["id", "name", "code", "is_active"]


class DepartmentSerializer(serializers.ModelSerializer):
    """Serializer for Department model."""
    
    clinic_name = serializers.CharField(source='location_clinic.name', read_only=True)
    head_name = serializers.CharField(source='head.get_full_name', read_only=True, allow_null=True)
    deputy_head_name = serializers.CharField(source='deputy_head.get_full_name', read_only=True, allow_null=True)
    staff_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'staff_count']

    def validate(self, attrs):
        head = attrs.get("head", getattr(self.instance, "head", None) if self.instance else None)
        deputy = attrs.get(
            "deputy_head",
            getattr(self.instance, "deputy_head", None) if self.instance else None,
        )
        head_id = getattr(head, "pk", head)
        deputy_id = getattr(deputy, "pk", deputy)
        if head_id and deputy_id and head_id == deputy_id:
            raise serializers.ValidationError(
                {"deputy_head": "Deputy head must be a different person from the department head."}
            )
        return attrs
    
    @extend_schema_field(OpenApiTypes.INT)
    def get_staff_count(self, obj):
        """Get count of staff assigned to this department."""
        return obj.staff.filter(is_active=True).count()


class RoomSerializer(serializers.ModelSerializer):
    """Serializer for Room model."""
    
    clinic_name = serializers.CharField(source='location_clinic.name', read_only=True, allow_null=True)
    department_name = serializers.CharField(source='department.name', read_only=True, allow_null=True)
    
    class Meta:
        model = Room
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class WorkLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkLocation
        fields = ["id", "name", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]


class SystemConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemConfig
        fields = ['key', 'value', 'description', 'updated_at']
        read_only_fields = ['key', 'description', 'updated_at']


class OutpatientClinicTypeSerializer(serializers.ModelSerializer):
    """Master visit (OPD) clinic type."""

    class Meta:
        model = OutpatientClinicType
        fields = [
            "id",
            "name",
            "code",
            "description",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
