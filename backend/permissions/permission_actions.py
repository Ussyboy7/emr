"""
Build module/action counts for the ``/auth/me`` permissions payload.
"""
from __future__ import annotations

from permissions.role_permissions import normalize_role_permissions_list

PAGE_TO_PERMISSION_MAP: dict[str, str] = {
    "/medical-records": "patient_view",
    "/medical-records/patients/new": "patient_create",
    "/medical-records/patients": "patient_view",
    "/medical-records/patient-records": "patient_view",
    "/medical-records/visits/new": "visit_create",
    "/medical-records/visits": "visit_view",
    "/medical-records/appointments": "visit_view",
    "/medical-records/referrals": "patient_view",
    "/medical-records/reports": "reports_view",
    "/medical-records/settings/referral-facilities": "patient_view",
    "/nursing": "nursing_vitals",
    "/nursing/analytics": "nursing_queue",
    "/nursing/pool-queue": "nursing_queue",
    "/nursing/room-queue": "nursing_queue",
    "/nursing/vitals-history": "nursing_vitals",
    "/nursing/patient-vitals": "nursing_vitals",
    "/nursing/procedures": "nursing_procedures",
    "/nursing/procedures/history": "nursing_procedures",
    "/nursing/wards": "nursing_vitals",
    "/nursing/inventory": "nursing_vitals",
    "/nursing/requests": "nursing_vitals",
    "/consultation": "consultation_view",
    "/consultation/start": "consultation_start",
    "/consultation/room": "consultation_start",
    "/consultation/history": "consultation_view",
    "/consultation/wards": "consultation_view",
    "/consultation/referrals": "consultation_referral",
    "/consultation/analytics": "consultation_view",
    "/laboratory": "lab_orders_view",
    "/laboratory/orders": "lab_orders_view",
    "/laboratory/verification": "lab_verify",
    "/laboratory/completed": "lab_orders_view",
    "/laboratory/templates": "lab_templates",
    "/laboratory/analytics": "lab_orders_view",
    "/pharmacy": "pharmacy_view",
    "/pharmacy/prescriptions": "pharmacy_view",
    "/pharmacy/history": "pharmacy_view",
    "/pharmacy/inventory": "pharmacy_inventory",
    "/pharmacy/requests": "pharmacy_inventory",
    "/pharmacy/store": "pharmacy_inventory",
    "/pharmacy/store/requests": "pharmacy_inventory",
    "/pharmacy/generics": "pharmacy_inventory",
    "/pharmacy/drugs": "pharmacy_inventory",
    "/pharmacy/analytics": "pharmacy_inventory",
    "/radiology": "radiology_view",
    "/radiology/orders": "radiology_view",
    "/radiology/verification": "radiology_verify",
    "/radiology/completed": "radiology_view",
    "/radiology/templates": "radiology_view",
    "/radiology/analytics": "radiology_view",
    "/radiology/viewer": "radiology_view",
    "/radiology/studies": "radiology_view",
    "/physiotherapy": "physio_view",
    "/physiotherapy/orders": "physio_view",
    "/physiotherapy/completed": "physio_view",
    "/physiotherapy/analytics": "physio_view",
    "/eyecare": "physio_view",
    "/eyecare/orders": "physio_view",
    "/eyecare/completed": "physio_view",
    "/eyecare/analytics": "physio_view",
    "/analytics": "analytics_view",
    "/analytics/executive": "analytics_executive",
    "/hr": "hr_view",
    "/hr/annual-checkups": "hr_view",
    "/hr/exemptions": "hr_view",
    "/admin": "admin_users",
    "/admin/users": "admin_users",
    "/admin/roles": "admin_roles",
    "/admin/clinics": "admin_clinics",
    "/admin/rooms": "admin_rooms",
    "/admin/settings": "admin_settings",
    "/admin/health": "admin_settings",
    "/admin/annual-checkup-programme": "admin_settings",
    "/admin/audit": "admin_audit",
}

PERMISSION_TO_MODULE_MAP: dict[str, str] = {
    "patient_view": "Medical Records",
    "patient_create": "Medical Records",
    "patient_edit": "Medical Records",
    "patient_delete": "Medical Records",
    "visit_view": "Medical Records",
    "visit_create": "Medical Records",
    "visit_edit": "Medical Records",
    "reports_view": "Medical Records",
    "reports_generate": "Medical Records",
    "consultation_view": "Consultation",
    "consultation_start": "Consultation",
    "consultation_prescribe": "Consultation",
    "consultation_diagnosis": "Consultation",
    "consultation_lab_order": "Consultation",
    "consultation_radiology_order": "Consultation",
    "consultation_referral": "Consultation",
    "consultation_nursing_order": "Consultation",
    "nursing_vitals": "Nursing",
    "nursing_triage": "Nursing",
    "nursing_administer": "Nursing",
    "nursing_procedures": "Nursing",
    "nursing_notes": "Nursing",
    "nursing_queue": "Nursing",
    "lab_orders_view": "Laboratory",
    "lab_collect": "Laboratory",
    "lab_process": "Laboratory",
    "lab_results": "Laboratory",
    "lab_verify": "Laboratory",
    "lab_templates": "Laboratory",
    "pharmacy_view": "Pharmacy",
    "pharmacy_dispense": "Pharmacy",
    "pharmacy_inventory": "Pharmacy",
    "pharmacy_substitute": "Pharmacy",
    "radiology_view": "Radiology",
    "radiology_perform": "Radiology",
    "radiology_report": "Radiology",
    "radiology_verify": "Radiology",
    "admin_users": "Administration",
    "admin_roles": "Administration",
    "admin_rooms": "Administration",
    "admin_clinics": "Administration",
    "admin_settings": "Administration",
    "admin_audit": "Administration",
    "physio_view": "Physiotherapy",
    "analytics_view": "Analytics",
    "analytics_executive": "Analytics",
    "hr_view": "Human Resources",
}

NURSING_PERMISSIONS = frozenset(
    {
        "nursing_vitals",
        "nursing_triage",
        "nursing_administer",
        "nursing_procedures",
        "nursing_notes",
        "nursing_queue",
    }
)


def build_permission_action_counts(user) -> dict[str, list[str]]:
    permission_counts: dict[str, list[str]] = {}

    user_roles = getattr(user, "user_roles", None)
    if user_roles is not None:
        roles_qs = user_roles.all()
    else:
        from permissions.models import UserRole

        roles_qs = UserRole.objects.filter(user=user).select_related("role")

    for user_role in roles_qs:
        role = user_role.role
        if role is None or not role.is_active:
            continue
        role_permissions = normalize_role_permissions_list(role.permissions)
        if not role_permissions:
            continue

        collected: set[str] = set()
        for page_url in role_permissions:
            permission_id = PAGE_TO_PERMISSION_MAP.get(page_url)
            if permission_id:
                collected.add(permission_id)

        if collected & NURSING_PERMISSIONS:
            collected |= set(NURSING_PERMISSIONS)

        for permission_id in collected:
            module = PERMISSION_TO_MODULE_MAP.get(permission_id)
            if not module:
                continue
            permission_counts.setdefault(module, [])
            if permission_id not in permission_counts[module]:
                permission_counts[module].append(permission_id)

    return permission_counts
