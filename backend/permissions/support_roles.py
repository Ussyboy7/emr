"""
Support access roles — derived from officer roles with reduced pages and capabilities.

Used by ``seed_support_roles`` management command.
"""
from __future__ import annotations

from permissions.role_permissions import (
    normalize_role_capabilities_list,
    normalize_role_permissions_list,
    normalize_role_permissions_payload,
)

# Capabilities never granted on support roles (officers retain via explicit grants).
SENSITIVE_CAPABILITY_IDS: frozenset[str] = frozenset(
    {
        "patient_delete",
        "patient_merge",
        "patient_unmerge",
        "patient_convert_csr",
        "patient_promote_officer",
        "patient_convert_retiree",
        "annual_checkup_programme_edit",
        "annual_checkup_programme_catalog_admin",
        "notification_routing_manage",
        "hr_compliance_manage",
        "annual_checkup_signoff",
        "clinical_data_view_all",
    }
)

# Admin / executive pages stripped from all module support roles.
SUPPORT_EXCLUDED_PAGES: frozenset[str] = frozenset(
    {
        "/admin",
        "/admin/annual-checkup-programme",
        "/admin/audit",
        "/admin/clinics",
        "/admin/roles",
        "/admin/settings",
        "/admin/users",
        "/admin/health",
        "/analytics/executive",
    }
)

# Extra pages removed per officer role when building the paired support role.
SUPPORT_EXCLUDED_PAGES_BY_OFFICER: dict[str, frozenset[str]] = {
    "Medical Records Officer": frozenset(
        {
            "/medical-records/coding",
            "/medical-records/reports",
        }
    ),
    "Pharmacist": frozenset({"/pharmacy/inventory"}),
    "Laboratory Scientist": frozenset({"/laboratory/templates"}),
    "Radiologist": frozenset({"/radiology/templates"}),
    "Medical Doctor": frozenset({"/consultation/referrals"}),
    "Human Resources Officer": frozenset({"/hr/exemptions"}),
}

# Officer access role name → support access role name (same module, reduced access).
OFFICER_SUPPORT_PAIRS: tuple[tuple[str, str], ...] = (
    ("Medical Records Officer", "Medical Records Support"),
    ("Pharmacist", "Pharmacy Support"),
    ("Laboratory Scientist", "Laboratory Support"),
    ("Nursing Officer", "Nursing Support"),
    ("Radiologist", "Radiology Support"),
    ("Physiotherapist", "Physiotherapy Support"),
    ("Medical Doctor", "Clinical Support"),
    ("Human Resources Officer", "HR Support"),
)

ICT_SUPPORT_NAME = "ICT Support"
ICT_SUPPORT_TYPE = "custom"
ICT_SUPPORT_PAGES: tuple[str, ...] = (
    "/admin/users",
    "/admin/clinics",
    "/admin/health",
    "/admin/support-tickets",
)
ICT_SUPPORT_DESCRIPTION = (
    "ICT helpdesk access — user and clinic administration, system health. "
    "For corps members and IT attachments (not full administrators)."
)


def is_support_role_name(name: str) -> bool:
    return (name or "").strip().lower().endswith(" support")


def build_support_permissions_from_officer(officer_role) -> dict:
    """Return permissions payload for a support role cloned from an officer role."""
    pages = normalize_role_permissions_list(officer_role.permissions)
    caps = normalize_role_capabilities_list(officer_role.permissions)
    excluded = SUPPORT_EXCLUDED_PAGES | SUPPORT_EXCLUDED_PAGES_BY_OFFICER.get(
        officer_role.name, frozenset()
    )
    support_pages = sorted(p for p in pages if p not in excluded)
    support_caps = sorted(c for c in caps if c not in SENSITIVE_CAPABILITY_IDS)
    return normalize_role_permissions_payload(
        {"pages": support_pages, "capabilities": support_caps}
    )


def build_ict_support_permissions() -> dict:
    return normalize_role_permissions_payload(
        {"pages": list(ICT_SUPPORT_PAGES), "capabilities": []}
    )


def support_description_for_officer(officer_name: str, support_name: str) -> str:
    return (
        f"Support-level {officer_name.replace(' Officer', '').replace(' Scientist', '')} access "
        f"for corps members, IT attachments, and assistants. "
        f"Paired with {officer_name}."
    )
