"""
Canonical capability IDs and page/API mappings for fine-grained RBAC.
"""
from __future__ import annotations

# (capability_id, display_name, module, description)
CAPABILITY_CATALOG: tuple[tuple[str, str, str, str], ...] = (
    ("patient_delete", "Delete / deactivate patients", "Medical Records", "Soft-delete patient records"),
    ("patient_merge", "Merge duplicate patients", "Medical Records", "Merge loser into winner patient"),
    ("patient_unmerge", "Unmerge patients", "Medical Records", "Revert a patient merge"),
    ("patient_convert_csr", "Convert retiree to CSR", "Medical Records", "Retiree category → CSR"),
    ("patient_promote_officer", "Promote staff to officer", "Medical Records", "Employee staff type → officer"),
    ("patient_convert_retiree", "Convert employee to retiree", "Medical Records", "Employee category → retiree"),
    ("annual_checkup_programme_edit", "Edit annual check-up programme", "Administration", "PATCH programme defaults and catalog"),
    ("annual_checkup_programme_catalog_admin", "Full programme catalog (incl. inactive)", "Administration", "View inactive catalog entries"),
    ("notification_routing_manage", "Manage notification routing", "Administration", "Edit notification routing matrix"),
    ("hr_compliance_manage", "HR compliance administration", "Human Resources", "Write HR compliance endpoints"),
    ("annual_checkup_signoff", "Annual check-up medical sign-off", "Human Resources", "Doctor sign-off on annual check-ups"),
    ("ward_order_create", "Create ward doctor orders", "Consultation", "Add nursing orders on Ward Rounds"),
    ("ward_order_edit", "Edit/cancel ward doctor orders", "Consultation", "Edit or cancel pending ward orders"),
    ("ward_order_perform", "Perform ward nursing tasks", "Nursing", "Administer injections, dressings, and ward instructions"),
    ("consultation_queue_override", "Override consultation room presence", "Nursing", "Send or reassign patients when doctor is not on seat (requires reason)"),
)

ALL_CAPABILITY_IDS: frozenset[str] = frozenset(c[0] for c in CAPABILITY_CATALOG)

# Page paths that imply capabilities (in addition to explicit role capabilities).
PAGE_TO_CAPABILITIES: dict[str, frozenset[str]] = {
    "/admin/annual-checkup-programme": frozenset(
        {"annual_checkup_programme_edit", "annual_checkup_programme_catalog_admin"}
    ),
    "/admin/settings": frozenset({"notification_routing_manage"}),
    "/hr": frozenset({"hr_compliance_manage"}),
    "/hr/annual-checkups": frozenset({"hr_compliance_manage"}),
    "/hr/exemptions": frozenset({"hr_compliance_manage"}),
    "/consultation/wards": frozenset({"ward_order_create", "ward_order_edit"}),
    "/nursing/wards": frozenset({"ward_order_perform"}),
}

# Documented API families per page (for admin effective-access preview).
PAGE_API_FAMILIES: dict[str, tuple[tuple[str, str, str], ...]] = {
    "/medical-records/patients": (
        ("patients/", "GET|POST", "List, search, register"),
        ("patients/{id}/", "GET|PATCH", "Patient detail and demographics"),
        ("patients/{id}/", "DELETE", "Requires patient_delete"),
        ("patients/{id}/merge/", "POST", "Requires patient_merge"),
        ("patients/{id}/unmerge/", "POST", "Requires patient_unmerge"),
        ("patients/{id}/convert-to-csr/", "PATCH", "Requires patient_convert_csr"),
        ("patients/{id}/promote/", "PATCH", "Requires patient_promote_officer"),
    ),
    "/admin/annual-checkup-programme": (
        ("annual-checkups/programme/", "GET", "Programme catalog and defaults"),
        ("annual-checkups/programme/", "PATCH", "Requires annual_checkup_programme_edit"),
    ),
    "/admin/settings": (
        ("notifications/", "*", "Notification admin"),
        ("common/routing-matrix", "*", "Requires notification_routing_manage"),
    ),
}
