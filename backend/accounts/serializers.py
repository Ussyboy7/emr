"""
Serializers for the Accounts app.
"""

from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from django.contrib.auth.password_validation import validate_password
from .models import User, SystemRole
from permissions.permission_actions import build_permission_action_counts
from permissions.access_role import get_primary_user_role
from permissions.user_pages import get_user_allowed_pages_for_response
from permissions.user_capabilities import get_user_capabilities_for_response


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model."""

    full_name = serializers.SerializerMethodField()
    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    permissions = serializers.SerializerMethodField()
    multi_clinic_enabled = serializers.SerializerMethodField()
    clinics_ids = serializers.SerializerMethodField()
    active_clinic_id = serializers.SerializerMethodField()
    is_department_head = serializers.SerializerMethodField()
    is_department_deputy = serializers.SerializerMethodField()
    headed_departments = serializers.SerializerMethodField()
    access_role_id = serializers.SerializerMethodField()
    access_role_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "middle_name",
            "custom_pages_mode",
            "custom_pages",
            "employee_id",
            "grade_level",
            "system_role",
            "permissions",
            "clinic",
            "clinic_name",
            "department",
            "department_name",
            "directorate",
            "division",  # Legacy fields
            "phone",
            "bio",
            "is_management",
            "is_active",
            "is_staff",
            "is_superuser",
            "is_department_head",
            "is_department_deputy",
            "headed_departments",
            "access_role_id",
            "access_role_name",
            "avatar",
            "last_activity",
            "last_login",
            "date_joined",
            # Multi-clinic fields
            "clinics_ids",
            "active_clinic_id",
            "multi_clinic_enabled",
        ]
        read_only_fields = [
            "id",
            "date_joined",
            "last_activity",
            "last_login",
            "clinic_name",
            "department_name",
            "clinics_ids",
            "multi_clinic_enabled",
        ]
        extra_kwargs = {
            "password": {"write_only": True, "required": False},
        }

    @extend_schema_field(OpenApiTypes.STR)
    def get_full_name(self, obj):
        return obj.get_full_name()

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_multi_clinic_enabled(self, obj):
        from organization.models import SystemConfig
        return SystemConfig.is_enabled('multi_clinic_enabled')

    @extend_schema_field({"type": "array", "items": {"type": "integer"}})
    def get_clinics_ids(self, obj):
        return list(obj.clinics.values_list('id', flat=True))

    @extend_schema_field({"type": "integer", "nullable": True})
    def get_active_clinic_id(self, obj):
        return obj.active_clinic_id

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_is_department_head(self, obj):
        from permissions.user_management import is_department_head
        return is_department_head(obj)

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_is_department_deputy(self, obj):
        from permissions.user_management import is_department_deputy_only
        return is_department_deputy_only(obj)

    @extend_schema_field({
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "name": {"type": "string"},
            },
        },
    })
    def get_headed_departments(self, obj):
        from permissions.user_management import headed_departments_for_user
        return headed_departments_for_user(obj)

    @extend_schema_field({"type": "integer", "nullable": True})
    def get_access_role_id(self, obj):
        user_role = get_primary_user_role(obj)
        return user_role.role_id if user_role else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_access_role_name(self, obj):
        user_role = get_primary_user_role(obj)
        if user_role and user_role.role:
            return user_role.role.name
        return ""

    @extend_schema_field({
    "type": "object",
    "properties": {
        "pages": {"type": "array", "items": {"type": "string"}},
        "actions": {"type": "object", "additionalProperties": {"type": "integer"}},
        "capabilities": {"type": "array", "items": {"type": "string"}},
    },
})
    def get_permissions(self, obj):
        """Get user permissions from their roles, with optional per-user page overrides."""
        return {
            "pages": get_user_allowed_pages_for_response(obj),
            "actions": build_permission_action_counts(obj),
            "capabilities": get_user_capabilities_for_response(obj),
        }


class UserDirectorySerializer(serializers.ModelSerializer):
    """
    Minimal, safe serializer for staff directory lookups.

    Used by non-admin pages to resolve staff names across departments without exposing
    the full user profile/permissions payload.
    """

    full_name = serializers.SerializerMethodField()
    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    # Frontend expects `system_role_name` in some places.
    system_role_name = serializers.CharField(source="system_role", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "middle_name",
            "full_name",
            "employee_id",
            "grade_level",
            "system_role_name",
            "clinic",
            "clinic_name",
            "department",
            "department_name",
            "is_active",
        ]
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_full_name(self, obj):
        return obj.get_full_name()


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users."""

    clinics = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.clinics.rel.model.objects.all(), required=False
    )
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "middle_name",
            "password",
            "password_confirm",
            "employee_id",
            "grade_level",
            "system_role",
            "clinic",
            "department",  # New ForeignKey fields
            "directorate",
            "division",  # Legacy fields
            "phone",
            "bio",
            "is_management",
            "is_active",
            "is_staff",
            "custom_pages_mode",
            "custom_pages",
            "clinics",  # Multi-clinic assignments
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        if attrs.get("password") != attrs.get("password_confirm"):
            raise serializers.ValidationError(
                {"password": "Password fields didn't match."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        clinics_data = validated_data.pop("clinics", None)
        user = User.objects.create_user(**validated_data)
        user.set_password(password)
        user.save()
        if clinics_data is not None:
            user.clinics.set(clinics_data)
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating user profile."""

    clinics = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.clinics.rel.model.objects.all(), required=False
    )

    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "middle_name",
            "email",
            "phone",
            "bio",
            "grade_level",
            "system_role",
            "clinic",
            "department",  # New ForeignKey fields
            "directorate",
            "division",  # Legacy fields
            "avatar",
            "is_active",
            "custom_pages_mode",
            "custom_pages",
            "active_clinic",  # Allow switching active clinic via update_me
            "clinics",  # Multi-clinic assignments
        ]


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for changing password."""

    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(
        required=True, write_only=True, validators=[validate_password]
    )
    new_password_confirm = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password": "New password fields didn't match."}
            )
        return attrs


class SystemRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemRole
        fields = ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']