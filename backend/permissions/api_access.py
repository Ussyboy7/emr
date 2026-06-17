"""
Map API URL paths (under /api/v1/) to required UI page permissions.
"""
from __future__ import annotations

import re

from permissions.page_paths import (
    user_has_any_page,
    user_has_clinical_module_access,
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
    "/medical-records/reports",
)

MODULE_API_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("nursing/", ("/nursing",)),
    (
        "consultation/",
        (
            "/consultation",
            "/medical-records/referrals",
            "/medical-records/coding",
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
    ("hr/", ("/hr",)),
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


def check_api_page_access(api_path: str, method: str, allowed_pages: set[str]) -> bool:
    api_path = normalize_api_path(api_path)
    method = (method or "GET").upper()

    if allowed_pages & (SUPERUSER_PAGES | ADMIN_ROLE_PAGES):
        return True

    if _is_exempt(api_path):
        return True

    # Staff directory / public lookup — any authenticated clinical or admin user.
    if api_path.startswith("accounts/users/directory") or api_path.startswith("accounts/users/public"):
        return user_has_clinical_module_access(allowed_pages) or user_has_any_page(
            allowed_pages, ("/admin/users", "/admin")
        )

    if api_path.startswith("accounts/users"):
        return user_has_any_page(allowed_pages, ("/admin/users", "/admin"))

    if api_path.startswith("accounts/system-roles"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return user_has_clinical_module_access(allowed_pages) or user_has_any_page(
                allowed_pages, ("/admin/users", "/admin")
            )
        return user_has_any_page(allowed_pages, ("/admin/users", "/admin"))

    if api_path.startswith("permissions/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return user_has_any_page(
                allowed_pages, ("/admin/roles", "/admin/users", "/admin")
            )
        return user_has_any_page(allowed_pages, ("/admin/roles",))

    if api_path.startswith(ADMIN_API_PREFIXES):
        return user_has_any_page(allowed_pages, ("/admin/settings", "/admin/clinics", "/admin"))

    if api_path.startswith(ORGANIZATION_ROOM_PREFIXES):
        if method in ("GET", "HEAD", "OPTIONS"):
            return user_has_any_page(allowed_pages, ("/admin/rooms", "/admin", "/consultation"))
        return user_has_any_page(allowed_pages, ("/admin/rooms", "/admin"))

    if api_path.startswith(ORGANIZATION_READ_PREFIXES):
        if method in ("GET", "HEAD", "OPTIONS"):
            return user_has_clinical_module_access(allowed_pages) or user_has_any_page(
                allowed_pages, ("/admin/clinics", "/admin/users", "/admin")
            )
        return user_has_any_page(allowed_pages, ("/admin/clinics", "/admin/settings", "/admin"))

    if api_path.startswith("reports/"):
        return user_has_any_page(
            allowed_pages,
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
            return user_has_any_page(
                allowed_pages,
                ("/laboratory/orders", "/laboratory", "/consultation/start", "/consultation"),
            )
        return user_has_any_page(allowed_pages, ("/laboratory/orders", "/laboratory"))

    # Consultation can create/read lab orders as part of encounter workflow.
    if api_path.startswith("laboratory/orders/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return user_has_any_page(
                allowed_pages,
                (
                    "/laboratory/orders",
                    "/laboratory",
                    "/consultation/start",
                    "/consultation",
                    "/physiotherapy/orders",
                    "/physiotherapy",
                ),
            )
        if method == "POST":
            return user_has_any_page(
                allowed_pages,
                ("/laboratory/orders", "/laboratory", "/consultation/start", "/consultation"),
            )
        return user_has_any_page(allowed_pages, ("/laboratory/orders", "/laboratory"))

    # Consultation can create/read radiology orders and browse radiology templates.
    if api_path.startswith("radiology/orders/"):
        if method in ("GET", "HEAD", "OPTIONS", "POST"):
            return user_has_any_page(
                allowed_pages,
                ("/radiology/orders", "/radiology", "/consultation/start", "/consultation"),
            )
        return user_has_any_page(allowed_pages, ("/radiology/orders", "/radiology"))

    if api_path.startswith("radiology/templates/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return user_has_any_page(
                allowed_pages,
                ("/radiology/orders", "/radiology", "/consultation/start", "/consultation"),
            )
        return user_has_any_page(allowed_pages, ("/radiology/orders", "/radiology"))

    # Consultation can create prescriptions and search generics for prescribing.
    if api_path.startswith("pharmacy/prescriptions/") or api_path.startswith("pharmacy/generics/for_prescription/"):
        if method in ("GET", "HEAD", "OPTIONS", "POST"):
            return user_has_any_page(
                allowed_pages,
                ("/pharmacy/prescriptions", "/pharmacy", "/consultation/start", "/consultation"),
            )
        return user_has_any_page(allowed_pages, ("/pharmacy/prescriptions", "/pharmacy"))

    # Physiotherapy APIs are mounted at root paths (/orders, /sessions, /templates, /stats).
    _PHYSIO_ROOT_PAGES = ("/physiotherapy/orders", "/physiotherapy", "/nursing/pool-queue")
    if api_path.startswith(("orders/", "sessions/", "templates/", "stats/", "patient-tracker/")):
        return user_has_any_page(allowed_pages, _PHYSIO_ROOT_PAGES)

    if api_path.startswith("common/"):
        if api_path.startswith("common/dashboard/admin") or api_path.startswith("common/metrics"):
            return user_has_any_page(allowed_pages, ("/admin",))
        if api_path.startswith("common/dashboard") or api_path.startswith("common/online-users"):
            return user_has_clinical_module_access(allowed_pages) or user_has_any_page(
                allowed_pages, ("/admin",)
            )
        if api_path.startswith(("common/export", "common/send-email")):
            return user_has_clinical_module_access(allowed_pages) or user_has_any_page(
                allowed_pages, ("/admin",)
            )
        return True

    if "routing-matrix" in api_path:
        return user_has_any_page(allowed_pages, ("/admin/settings", "/admin"))

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
                return user_has_clinical_module_access(allowed_pages) or user_has_any_page(
                    allowed_pages, MEDICAL_RECORDS_PAGES
                )
            return user_has_any_page(allowed_pages, MEDICAL_RECORDS_PAGES)
        if _PATIENT_LIST.match(api_path.rstrip("/")):
            return user_has_any_page(
                allowed_pages,
                ("/medical-records/patients/new", "/medical-records/patients"),
            )
        return user_has_any_page(
            allowed_pages,
            ("/medical-records/patients", "/medical-records/patients/new"),
        )

    if api_path.startswith("visits/"):
        if not _is_write(method):
            if _VISIT_LIST.match(api_path.rstrip("/")):
                # Nursing pool queue and other clinical modules consume visit lists.
                return user_has_clinical_module_access(allowed_pages) or user_has_any_page(
                    allowed_pages, MEDICAL_RECORDS_PAGES
                )
            if (
                _VISIT_DETAIL.match(api_path)
                or "resolve" in api_path
                or "workspace-bundle" in api_path
                or api_path.endswith("/list-stats/")
                or "nursing-" in api_path
            ):
                return user_has_clinical_module_access(allowed_pages)
            return user_has_any_page(allowed_pages, MEDICAL_RECORDS_PAGES)
        if _VISIT_LIST.match(api_path.rstrip("/")):
            return user_has_any_page(
                allowed_pages,
                (
                    "/medical-records/visits/new",
                    "/medical-records/visits",
                    "/consultation/start",
                ),
            )
        return user_has_any_page(
            allowed_pages,
            (
                "/medical-records/visits",
                "/medical-records/visits/new",
                "/medical-records/patient-records",
                "/nursing",
                "/consultation",
            ),
        )

    if api_path.startswith("vitals/"):
        read_pages = (
            "/nursing",
            "/nursing/pool-queue",
            "/nursing/vitals-history",
            "/consultation",
            "/medical-records",
            "/medical-records/patient-records",
        )
        write_pages = (
            "/nursing/pool-queue",
            "/nursing/vitals-history",
            "/nursing/patient-vitals",
            "/nursing",
            "/consultation/start",
            "/consultation",
        )
        if _is_write(method):
            return user_has_any_page(allowed_pages, write_pages)
        return user_has_any_page(allowed_pages, read_pages)

    if api_path.startswith("medical-certificates/"):
        return user_has_any_page(
            allowed_pages,
            ("/consultation", "/medical-records/patient-records", "/medical-records"),
        )

    # Nursing pool queue sends patients into Eye Clinic queue (physio check-in uses root /orders/).
    if api_path.startswith("eyecare/orders/checkin-from-visit") or api_path.startswith("eyecare/orders/checkins-for-visits"):
        return user_has_any_page(
            allowed_pages,
            ("/nursing/pool-queue", "/eyecare/orders", "/eyecare"),
        )

    if api_path.startswith("annual-checkups/"):
        return user_has_any_page(
            allowed_pages,
            ("/hr/annual-checkups", "/admin/annual-checkup-programme", "/medical-records"),
        )

    for prefix, pages in MODULE_API_RULES:
        if api_path.startswith(prefix):
            return user_has_any_page(allowed_pages, pages)

    # ICD-10 / complaint catalogs — consultation + records.
    if (
        api_path.startswith("icd10-codes/")
        or api_path.startswith("presenting-complaint")
        or api_path.startswith("diagnoses/")
    ):
        return user_has_clinical_module_access(allowed_pages)

    # Unknown API — deny by default (fail closed).
    return False
