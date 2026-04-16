"""
Serializers for the Accounts app.
"""

from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model."""

    full_name = serializers.SerializerMethodField()
    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True)
    permissions = serializers.SerializerMethodField()

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
            "avatar",
            "last_activity",
            "last_login",
            "date_joined",
        ]
        read_only_fields = [
            "id",
            "date_joined",
            "last_activity",
            "last_login",
            "clinic_name",
            "department_name",
        ]
        extra_kwargs = {
            "password": {"write_only": True, "required": False},
        }

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_permissions(self, obj):
        """Get user permissions from their roles, with optional per-user page overrides."""
        allowed_pages = set()
        permission_counts = {}

        for user_role in obj.user_roles.all():
            role_permissions = user_role.role.permissions or []
            if isinstance(role_permissions, list):
                # Add all allowed pages from this role
                allowed_pages.update(role_permissions)

                # Build permission counts for UI display
                # Map page URLs to permission IDs that match the UI
                page_to_permission_map = {
                    # Medical Records
                    "/medical-records": "patient_view",
                    "/medical-records/patients/new": "patient_create",
                    "/medical-records/patients": "patient_view",
                    "/medical-records/visits/new": "visit_create",
                    "/medical-records/visits": "visit_view",
                    "/medical-records/appointments": "visit_view",
                    "/medical-records/dependents": "patient_view",
                    "/medical-records/referrals": "patient_view",
                    "/medical-records/reports": "reports_view",
                    # Nursing
                    "/nursing": "nursing_vitals",  # Just need one permission to count as having nursing access
                    "/nursing/pool-queue": "nursing_queue",
                    "/nursing/room-queue": "nursing_queue",
                    "/nursing/patient-vitals": "nursing_vitals",
                    "/nursing/procedures": "nursing_procedures",
                    "/nursing/procedures/history": "nursing_procedures",
                    "/nursing/wards": "nursing_vitals",
                    # Consultation
                    "/consultation": "consultation_view",
                    "/consultation/start": "consultation_start",
                    "/consultation/history": "consultation_view",
                    "/consultation/wards": "consultation_view",
                    "/consultation/referrals": "consultation_referral",
                    # Laboratory
                    "/laboratory": "lab_orders_view",
                    "/laboratory/orders": "lab_orders_view",
                    "/laboratory/verification": "lab_verify",
                    "/laboratory/completed": "lab_orders_view",
                    "/laboratory/templates": "lab_templates",
                    # Pharmacy
                    "/pharmacy": "pharmacy_view",
                    "/pharmacy/prescriptions": "pharmacy_view",
                    "/pharmacy/history": "pharmacy_view",
                    "/pharmacy/inventory": "pharmacy_inventory",
                    "/pharmacy/requests": "pharmacy_inventory",
                    "/pharmacy/store": "pharmacy_inventory",
                    # Radiology
                    "/radiology": "radiology_view",
                    "/radiology/orders": "radiology_view",
                    "/radiology/verification": "radiology_verify",
                    "/radiology/completed": "radiology_view",
                    "/radiology/templates": "radiology_view",
                    # Physiotherapy
                    "/physiotherapy": "physio_view",
                    "/physiotherapy/pool-queue": "physio_view",
                    "/physiotherapy/completed": "physio_view",
                    # Analytics
                    "/analytics": "analytics_view",
                    "/analytics/executive": "analytics_executive",
                    # Administration
                    "/admin": "admin_users",
                    "/admin/users": "admin_users",
                    "/admin/roles": "admin_roles",
                    "/admin/clinics": "admin_clinics",
                    "/admin/rooms": "admin_rooms",
                    "/admin/settings": "admin_settings",
                    "/admin/audit": "admin_audit",
                }

                # Collect all permission IDs from page mappings
                collected_permissions = set()
                for page_url in role_permissions:
                    if page_url in page_to_permission_map:
                        permission_id = page_to_permission_map[page_url]
                        collected_permissions.add(permission_id)

                # Special handling: if user has any nursing permission, give them all nursing permissions
                nursing_permissions = [
                    "nursing_vitals",
                    "nursing_triage",
                    "nursing_administer",
                    "nursing_procedures",
                    "nursing_notes",
                    "nursing_queue",
                ]
                if any(p in nursing_permissions for p in collected_permissions):
                    collected_permissions.update(nursing_permissions)

                # Group permissions by module
                permission_to_module_map = {
                    # Medical Records
                    "patient_view": "Medical Records",
                    "patient_create": "Medical Records",
                    "patient_edit": "Medical Records",
                    "patient_delete": "Medical Records",
                    "visit_view": "Medical Records",
                    "visit_create": "Medical Records",
                    "visit_edit": "Medical Records",
                    "reports_view": "Medical Records",
                    "reports_generate": "Medical Records",
                    # Consultation
                    "consultation_view": "Consultation",
                    "consultation_start": "Consultation",
                    "consultation_prescribe": "Consultation",
                    "consultation_diagnosis": "Consultation",
                    "consultation_lab_order": "Consultation",
                    "consultation_radiology_order": "Consultation",
                    "consultation_referral": "Consultation",
                    "consultation_nursing_order": "Consultation",
                    # Nursing
                    "nursing_vitals": "Nursing",
                    "nursing_triage": "Nursing",
                    "nursing_administer": "Nursing",
                    "nursing_procedures": "Nursing",
                    "nursing_notes": "Nursing",
                    "nursing_queue": "Nursing",
                    # Laboratory
                    "lab_orders_view": "Laboratory",
                    "lab_collect": "Laboratory",
                    "lab_process": "Laboratory",
                    "lab_results": "Laboratory",
                    "lab_verify": "Laboratory",
                    "lab_templates": "Laboratory",
                    # Pharmacy
                    "pharmacy_view": "Pharmacy",
                    "pharmacy_dispense": "Pharmacy",
                    "pharmacy_inventory": "Pharmacy",
                    "pharmacy_substitute": "Pharmacy",
                    # Radiology
                    "radiology_view": "Radiology",
                    "radiology_perform": "Radiology",
                    "radiology_report": "Radiology",
                    "radiology_verify": "Radiology",
                    # Administration
                    "admin_users": "Administration",
                    "admin_roles": "Administration",
                    "admin_rooms": "Administration",
                    "admin_clinics": "Administration",
                    "admin_settings": "Administration",
                    "admin_audit": "Administration",
                    # Other modules
                    "physio_view": "Physiotherapy",
                    "analytics_view": "Analytics",
                    "analytics_executive": "Analytics",
                }

                for permission_id in collected_permissions:
                    if permission_id in permission_to_module_map:
                        module = permission_to_module_map[permission_id]
                        if module not in permission_counts:
                            permission_counts[module] = []
                        if permission_id not in permission_counts[module]:
                            permission_counts[module].append(permission_id)

        # Always include global user features for authenticated users
        global_pages = {"/notifications", "/settings", "/help"}
        allowed_pages.update(global_pages)

        return {
            "pages": list(self._apply_page_overrides(obj, allowed_pages)),
            "actions": permission_counts,
        }

    def _apply_page_overrides(self, obj, role_pages: set[str]) -> set[str]:
        mode = (getattr(obj, "custom_pages_mode", "") or "").strip()
        custom = getattr(obj, "custom_pages", None)
        custom_pages = set(custom) if isinstance(custom, list) else set()

        if mode == "replace":
            return set(custom_pages)
        if mode == "add":
            return set(role_pages) | set(custom_pages)
        if mode == "restrict":
            return set(role_pages) - set(custom_pages)
        return set(role_pages)


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

    def get_full_name(self, obj):
        return obj.get_full_name()


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users."""

    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
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
        ]

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password": "Password fields didn't match."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        user = User.objects.create_user(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating user profile."""

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
