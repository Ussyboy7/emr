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
    "/medical-records/reports",
)

MODULE_API_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("nursing/", ("/nursing",)),
    ("consultation/", ("/consultation", "/medical-records/referrals")),
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
)

ADMIN_API_PREFIXES = (
    "system-config/",
)

ORGANIZATION_READ_PREFIXES = (
    "clinics/",
    "departments/",
    "work-locations/",
    "outpatient-clinic-types/",
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
    return raw.lstrip("/")


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

    if api_path.startswith(ADMIN_API_PREFIXES):
        return user_has_any_page(allowed_pages, ("/admin/settings", "/admin/clinics", "/admin"))

    if api_path.startswith("rooms/"):
        if method in ("GET", "HEAD", "OPTIONS"):
            return user_has_any_page(allowed_pages, ("/admin/rooms", "/admin", "/consultation"))
        return user_has_any_page(allowed_pages, ("/admin/rooms", "/admin"))

    if api_path.startswith(ORGANIZATION_READ_PREFIXES):
        if method in ("GET", "HEAD", "OPTIONS"):
            return user_has_clinical_module_access(allowed_pages) or user_has_any_page(
                allowed_pages, ("/admin/clinics", "/admin")
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
            "/nursing/vitals-history",
            "/consultation",
            "/medical-records",
            "/medical-records/patient-records",
        )
        write_pages = (
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
