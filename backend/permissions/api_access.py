"""
Map API URL paths (under /api/v1/) to required UI page permissions.
"""
from __future__ import annotations

import re

from permissions.page_paths import (
    user_has_any_page,
    user_has_clinical_module_access,
    user_has_consultation_access,
    user_has_exact_page,
)
from permissions.user_pages import ADMIN_ROLE_PAGES, SUPERUSER_PAGES

EXEMPT_API_PREFIXES = (
    "accounts/auth/",
    "health/",
    "health/live/",
    "support/client-logs",
)

NOTIFICATIONS_USER_PREFIXES = (
    "notifications/",
    "preferences/",
)

MEDICAL_RECORDS_PAGES = (
    "/medical-records",
    "/medical-records/patients",
    "/medical-records/patients/new",
    "/medical-records/patient-records",
    "/medical-records/visits",
    "/medical-records/visits/new",
    "/medical-records/appointments",
    "/medical-records/referrals",
    "/medical-records/coding",
    "/medical-records/diagnosis-review",
    "/medical-records/reports",
)

CONSULTATION_PAGES = (
    "/consultation",
    "/consultation/start",
    "/consultation/room",
    "/consultation/history",
    "/consultation/wards",
    "/consultation/referrals",
    "/consultation/analytics",
)


def _consultation_clinical_access(
    allowed_pages: set[str],
    denied_pages: set[str] | None = None,
) -> bool:
    denied = denied_pages or set()
    return user_has_consultation_access(allowed_pages) or user_has_any_page(
        allowed_pages, CONSULTATION_PAGES, denied
    )

MODULE_API_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("nursing/", ("/nursing",)),
    (
        "consultation/",
        (
            "/consultation",
            "/medical-records/referrals",
            "/medical-records/coding",
            "/medical-records/diagnosis-review",
            # Admin room management lives in the Clinics & Departments page
            # (Rooms tab) and uses consultation/rooms/ (ConsultationRoom model).
            "/admin/clinics",
            # Nursing room queue page fetches consultation rooms/sessions/queue APIs.
            "/nursing/room-queue",
            # Nursing pool queue also fetches consultation queue/session APIs.
            "/nursing/pool-queue",
        ),
    ),
    ("laboratory/", ("/laboratory",)),
    ("pharmacy/", ("/pharmacy",)),
    ("radiology/", ("/radiology",)),
    ("physiotherapy/", ("/physiotherapy",)),
    ("eyecare/", ("/eyecare",)),
    ("wards/", ("/nursing/wards", "/consultation/wards")),
    ("appointments/", ("/medical-records/appointments",)),
    ("analytics/", ("/analytics", "/analytics/executive")),
    ("dashboard/", ("/dashboard", "/admin")),
    ("audit/", ("/admin/audit",)),
    ("permissions/", ("/admin/roles",)),
    # Wards app exposes admission routes under top-level `admissions/` paths.
    ("admissions/", ("/nursing/wards", "/consultation/wards")),
)

ADMIN_API_PREFIXES = (
    "system-config/",
    "organization/system-config/",
)

ORGANIZATION_READ_PREFIXES = (
    "organization/clinics/",
    "organization/departments/",
    "organization/work-locations/",
    "organization/outpatient-clinic-types/",
    "clinics/",
    "departments/",
    "work-locations/",
    "outpatient-clinic-types/",
)

ORGANIZATION_ROOM_PREFIXES = (
    "organization/rooms/",
    "rooms/",
)

_PATIENT_DETAIL = re.compile(r"^patients/\d+")
_PATIENT_LIST = re.compile(r"^patients/?$")
_VISIT_DETAIL = re.compile(r"^visits/\d+")
_VISIT_LIST = re.compile(r"^visits/?$")

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _is_write(method: str) -> bool:
    return method in WRITE_METHODS


def normalize_api_path(path: str) -> str:
    raw = (path or "").strip()
    for prefix in ("/api/v1/", "/api/"):
        if raw.startswith(prefix):
            raw = raw[len(prefix) :]
            break
    path = raw.lstrip("/")
    if path.startswith("v1/"):
        path = path[3:]
    return path


def _is_exempt(api_path: str) -> bool:
    if api_path in ("health/", "health/live/"):
        return True
    if api_path.startswith(EXEMPT_API_PREFIXES):
        return True
    if "routing-matrix" in api_path:
        return False
    if api_path.startswith(NOTIFICATIONS_USER_PREFIXES):
        return True
    if api_path.startswith(("common/server-time", "common/upload", "common/media/")):
        return True
    return False


def check_api_page_access(
    api_path: str,
    method: str,
    allowed_pages: set[str],
    denied_pages: set[str] | None = None,
) -> bool:
    api_path = normalize_api_path(api_path)
    method = (method or "GET").upper()
    denied = denied_pages or set()

    def has_any(required_pages: tuple[str, ...] | list[str]) -> bool:
        return user_has_any_page(allowed_pages, required_pages, denied)

    if allowed_pages & (SUPERUSER_PAGES | ADMIN_ROLE_PAGES):
        return True

    if _is_exempt(api_path):
        return True

    # Staff directory / public lookup — any authenticated clinical or admin user.
    if api_path.startswith("accounts/users/directory") or api_path.startswith("accounts/users/public"):
        return user_has_clinical_module_access(allowed_pages) or has_any( ("/admin/users", "/admin")
        )

    if api_path.startswith("accounts/users"):
        return has_any( ("/admin/users", "/admin"))

    if api_path.startswith("accounts/system-roles"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return user_has_clinical_module_access(allowed_pages) or has_any( ("/admin/users", "/admin")
            )
        return has_any( ("/admin/users", "/admin"))

    if api_path.startswith("permissions/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return has_any( ("/admin/roles", "/admin/users", "/admin")
            )
        return has_any( ("/admin/roles",))

    if api_path.startswith("organization/security-settings"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return True
        return has_any( ("/admin/settings", "/admin"))

    if api_path.startswith(ADMIN_API_PREFIXES):
        return has_any( ("/admin/settings", "/admin/clinics", "/admin"))

    if api_path.startswith(ORGANIZATION_ROOM_PREFIXES):
        if method in ("GET", "HEAD", "OPTIONS"):
            return has_any( ("/admin/clinics", "/admin", "/consultation"))
        return has_any( ("/admin/clinics", "/admin"))

    if api_path.startswith(ORGANIZATION_READ_PREFIXES):
        if method in ("GET", "HEAD", "OPTIONS"):
            return user_has_clinical_module_access(allowed_pages) or has_any( ("/admin/clinics", "/admin/users", "/admin")
            )
        return has_any( ("/admin/clinics", "/admin/settings", "/admin"))

    if api_path.startswith("reports/"):
        return has_any(
            (
                "/medical-records/reports",
                "/analytics",
                "/analytics/executive",
                "/pharmacy/analytics",
                "/laboratory/analytics",
            ),
        )

    # Consultation ordering UIs need to load lab templates for test selection.
    if api_path.startswith("laboratory/templates/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any( ("/laboratory/orders", "/laboratory"),
            )
        return has_any( ("/laboratory/orders", "/laboratory"))

    # Consultation can create/read lab orders as part of encounter workflow.
    if api_path.startswith("laboratory/orders/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any(
                ("/laboratory/orders", "/laboratory", "/physiotherapy/orders", "/physiotherapy"),
            )
        if method == "POST":
            return _consultation_clinical_access(allowed_pages, denied) or has_any( ("/laboratory/orders", "/laboratory"),
            )
        return has_any( ("/laboratory/orders", "/laboratory"))

    # Consultation can create/read radiology orders and browse radiology templates.
    if api_path.startswith("radiology/orders/"):
        if method in ("GET", "HEAD", "OPTIONS", "POST"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any( ("/radiology/orders", "/radiology"),
            )
        return has_any( ("/radiology/orders", "/radiology"))

    # Consultation patient history — read completed lab results (values + PDF).
    if api_path.startswith("laboratory/tests/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any(
                ("/laboratory/completed", "/laboratory/verification", "/laboratory"),
            )
        return has_any( ("/laboratory/orders", "/laboratory"))

    if api_path.startswith("laboratory/verification/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any(
                ("/laboratory/completed", "/laboratory/verification", "/laboratory"),
            )
        return has_any( ("/laboratory/verification", "/laboratory"))

    # Consultation patient history — read verified radiology reports / studies.
    if api_path.startswith("radiology/verification/") or api_path.startswith("radiology/studies/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any(
                ("/radiology/completed", "/radiology/verification", "/radiology"),
            )
        if api_path.startswith("radiology/verification/"):
            return has_any( ("/radiology/verification", "/radiology"))
        return has_any( ("/radiology/orders", "/radiology"))

    if api_path.startswith("radiology/templates/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any( ("/radiology/orders", "/radiology"),
            )
        return has_any( ("/radiology/orders", "/radiology"))

    # Consultation can create prescriptions and search generics for prescribing.
    if api_path.startswith("pharmacy/hod-stock-issues/"):
        hod_pages = ("/pharmacy/hod-store", "/pharmacy/hod-store/history")
        if method in ("GET", "HEAD", "OPTIONS"):
            return has_any( hod_pages)
        return has_any( ("/pharmacy/hod-store",))

    if api_path.startswith("pharmacy/prescriptions/") or api_path.startswith("pharmacy/generics/for_prescription/"):
        if method in ("GET", "HEAD", "OPTIONS", "POST"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any( ("/pharmacy/prescriptions", "/pharmacy"),
            )
        return has_any( ("/pharmacy/prescriptions", "/pharmacy"))

    # Consultation can create/update nursing procedure orders on ward rounds.
    if api_path.startswith("nursing/orders/"):
        if method in ("GET", "HEAD", "OPTIONS", "POST"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any( ("/nursing/procedures", "/nursing"),
            )
        return _consultation_clinical_access(allowed_pages, denied) or has_any(
            ("/nursing/procedures", "/nursing", "/consultation/wards"),
        )

    # Consultation observation admission needs ward list + existing-admission checks.
    if api_path.startswith("wards/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any( ("/nursing/wards", "/consultation/wards"),
            )
        return has_any( ("/nursing/wards", "/consultation/wards"))

    if api_path.startswith("admissions/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any( ("/nursing/wards", "/consultation/wards"),
            )
        if "discharge" in api_path:
            return _consultation_clinical_access(allowed_pages, denied) or has_any( ("/nursing/wards", "/consultation/wards"),
            )
        return has_any( ("/nursing/wards", "/consultation/wards"))

    # Ward Care chart APIs (beds, nurse assignments, vitals, treatment sheet, escorts).
    if api_path.startswith(
        ("beds/", "assignments/", "observation-vitals/", "treatment-sheet-rows/", "admission-escorts/")
    ):
        if method in ("GET", "HEAD", "OPTIONS"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any(
                ("/nursing/wards", "/consultation/wards"),
            )
        return has_any( ("/nursing/wards", "/consultation/wards"))

    # Consultation can order physiotherapy (APIs mounted at root /orders/).
    if api_path.startswith("orders/"):
        if api_path.startswith("orders/checkin-from-visit") or api_path.startswith(
            "orders/checkins-for-visits"
        ):
            return has_any(
                ("/nursing/pool-queue", "/physiotherapy/orders", "/physiotherapy"),
            )
        return _consultation_clinical_access(allowed_pages, denied) or has_any(
            ("/physiotherapy/orders", "/physiotherapy"),
        )

    if api_path.startswith(("sessions/", "templates/", "stats/", "patient-tracker/")):
        return _consultation_clinical_access(allowed_pages, denied) or has_any(
            ("/physiotherapy/orders", "/physiotherapy"),
        )

    # Consultation can create eye clinic orders (check-in paths handled separately below).
    if api_path.startswith("eyecare/orders/"):
        if api_path.startswith("eyecare/orders/checkin-from-visit") or api_path.startswith(
            "eyecare/orders/checkins-for-visits"
        ):
            return has_any(
                ("/nursing/pool-queue", "/eyecare/orders", "/eyecare"),
            )
        if method in ("GET", "HEAD", "OPTIONS", "POST"):
            return _consultation_clinical_access(allowed_pages, denied) or has_any( ("/eyecare/orders", "/eyecare"),
            )
        return has_any( ("/eyecare/orders", "/eyecare"))

    if api_path.startswith("common/"):
        if api_path.startswith("common/dashboard/admin") or api_path.startswith("common/metrics"):
            return has_any( ("/admin",))
        if api_path.startswith("common/dashboard") or api_path.startswith("common/online-users"):
            return user_has_clinical_module_access(allowed_pages) or has_any( ("/admin",)
            )
        if api_path.startswith(("common/export", "common/send-email")):
            return user_has_clinical_module_access(allowed_pages) or has_any( ("/admin",)
            )
        return True

    if "routing-matrix" in api_path:
        return has_any( ("/admin/settings", "/admin"))

    if api_path.startswith("patients/"):
        if not _is_write(method):
            if (
                _PATIENT_DETAIL.match(api_path)
                or api_path.startswith("patients/resolve")
                or api_path.startswith("patients/dependents-counts")
                or api_path.startswith("patients/counts")
            ):
                return user_has_clinical_module_access(allowed_pages)
            # Clinical modules (Lab/Radiology/Consultation/etc.) need patient search/list
            # for order-entry flows (e.g. New External Lab Request).
            if _PATIENT_LIST.match(api_path.rstrip("/")):
                return user_has_clinical_module_access(allowed_pages) or has_any( MEDICAL_RECORDS_PAGES
                )
            return has_any( MEDICAL_RECORDS_PAGES)
        if _PATIENT_LIST.match(api_path.rstrip("/")):
            return has_any(
                ("/medical-records/patients/new", "/medical-records/patients"),
            )
        if "update_history" in api_path:
            return _consultation_clinical_access(allowed_pages, denied) or has_any(
                ("/medical-records/patients", "/medical-records/patient-records"),
            )
        return has_any(
            ("/medical-records/patients", "/medical-records/patients/new"),
        )

    if api_path.startswith("visits/"):
        if not _is_write(method):
            if _VISIT_LIST.match(api_path.rstrip("/")):
                # Nursing pool queue and other clinical modules consume visit lists.
                return user_has_clinical_module_access(allowed_pages) or has_any( MEDICAL_RECORDS_PAGES
                )
            if (
                _VISIT_DETAIL.match(api_path)
                or "resolve" in api_path
                or "workspace-bundle" in api_path
                or api_path.endswith("/list-stats/")
                or "nursing-" in api_path
            ):
                return user_has_clinical_module_access(allowed_pages)
            return has_any( MEDICAL_RECORDS_PAGES)
        if _VISIT_LIST.match(api_path.rstrip("/")):
            return _consultation_clinical_access(allowed_pages, denied) or has_any(
                ("/medical-records/visits/new", "/medical-records/visits"),
            )
        return _consultation_clinical_access(allowed_pages, denied) or has_any(
            (
                "/medical-records/visits",
                "/medical-records/visits/new",
                "/medical-records/patient-records",
                "/nursing",
            ),
        )

    if api_path.startswith("vitals/"):
        if _is_write(method):
            return _consultation_clinical_access(allowed_pages, denied) or has_any(
                (
                    "/nursing/pool-queue",
                    "/nursing/vitals-history",
                    "/nursing/patient-vitals",
                    "/nursing",
                ),
            )
        return _consultation_clinical_access(allowed_pages, denied) or has_any(
            (
                "/nursing",
                "/nursing/pool-queue",
                "/nursing/vitals-history",
                "/medical-records",
                "/medical-records/patient-records",
            ),
        )

    if api_path.startswith("medical-certificates/"):
        return _consultation_clinical_access(allowed_pages, denied) or has_any(
            ("/medical-records/patient-records", "/medical-records"),
        )

    if api_path.startswith("annual-checkups/"):
        return _consultation_clinical_access(allowed_pages, denied) or has_any(
            ("/hr/annual-checkups", "/admin/annual-checkup-programme", "/medical-records"),
        )

    if api_path.startswith("appointments/"):
        return _consultation_clinical_access(allowed_pages, denied) or has_any(
            ("/medical-records/appointments",),
        )

    if api_path.startswith("support/tickets/queue"):
        return has_any(
            ("/admin/support-tickets", "/admin/audit", "/admin"),
        )

    if re.match(r"support/tickets/\d+/?$", api_path):
        return has_any(
            ("/admin/support-tickets", "/admin/audit", "/admin"),
        )

    if api_path.startswith("support/docs"):
        return bool(allowed_pages)

    if api_path.startswith("support/tickets"):
        return bool(allowed_pages)

    if api_path.startswith("hr/exemptions"):
        return user_has_exact_page(allowed_pages, "/hr/exemptions")

    if api_path.startswith("hr/"):
        return has_any(
            ("/hr", "/hr/annual-checkups", "/hr/exemptions"),
        )

    for prefix, pages in MODULE_API_RULES:
        if api_path.startswith(prefix):
            if prefix == "consultation/":
                if (
                    "rooms/" in api_path
                    and any(
                        segment in api_path
                        for segment in (
                            "check-in",
                            "check-out",
                            "set-accepting",
                            "heartbeat",
                        )
                    )
                ):
                    return _consultation_clinical_access(allowed_pages, denied)
                return _consultation_clinical_access(allowed_pages, denied) or has_any( pages
                )
            return has_any( pages)

    # ICD-10 / complaint catalogs — consultation + records.
    if (
        api_path.startswith("icd10-codes/")
        or api_path.startswith("presenting-complaint")
        or api_path.startswith("diagnoses/")
    ):
        return user_has_clinical_module_access(allowed_pages)

    # Unknown API — deny by default (fail closed).
    return False
