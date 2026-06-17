"""
Canonical page-path normalization and prefix matching (mirrors frontend ``page-permissions.ts``).
"""
from __future__ import annotations

GLOBAL_USER_PAGES = frozenset({"/notifications", "/settings", "/help"})

LEGACY_PAGE_PATH_ALIASES = {
    "/consultation/dashboard": "/consultation",
    "/nursing/patient-vitals": "/nursing/vitals-history",
    # Legacy path used by older seeds/UI; dependents are managed via Patients.
    "/medical-records/dependents": "/medical-records/patients",
    "/medical-records/reports/attendance-summary": "/medical-records/reports/attendance-statistics",
    "/medical-records/reports/clinic-attendance": "/medical-records/reports/clinic-statistics",
    "/medical-records/reports/gop-attendance": "/medical-records/reports/clinic-statistics",
}

CLINICAL_MODULE_PREFIXES = (
    "/medical-records",
    "/nursing",
    "/consultation",
    "/laboratory",
    "/pharmacy",
    "/radiology",
    "/physiotherapy",
    "/eyecare",
)


def normalize_role_page_path(path: str) -> str:
    raw = (path or "").strip()
    if not raw:
        return raw
    no_trailing = raw.rstrip("/") or "/"
    return LEGACY_PAGE_PATH_ALIASES.get(no_trailing, LEGACY_PAGE_PATH_ALIASES.get(raw, no_trailing))


def is_path_allowed_by_pages(pathname: str, allowed_pages: set[str]) -> bool:
    """Return True when ``pathname`` is allowed by any entry in ``allowed_pages``."""
    if not pathname or pathname == "/":
        return False

    normalized_path = normalize_role_page_path(pathname)
    normalized_allowed = {normalize_role_page_path(p) for p in allowed_pages}

    if normalized_path in normalized_allowed:
        return True

    for allowed in normalized_allowed:
        if not allowed or allowed == "/":
            continue
        if normalized_path == allowed or normalized_path.startswith(allowed + "/"):
            return True
        if allowed.startswith(normalized_path + "/"):
            return True

    if normalized_path.startswith("/medical-records/patients/") and "/medical-records/patient-records" in normalized_allowed:
        return True

    if normalized_path == "/consultation/room" or normalized_path.startswith("/consultation/room/"):
        if normalized_allowed & {"/consultation", "/consultation/start", "/consultation/room"}:
            return True
        if any(p.startswith("/consultation/room/") for p in normalized_allowed):
            return True

    return False


def user_has_any_page(allowed_pages: set[str], required_pages: list[str] | tuple[str, ...]) -> bool:
    return any(is_path_allowed_by_pages(page, allowed_pages) for page in required_pages)


def user_has_clinical_module_access(allowed_pages: set[str]) -> bool:
    for page in allowed_pages:
        normalized = normalize_role_page_path(page)
        for prefix in CLINICAL_MODULE_PREFIXES:
            if normalized == prefix or normalized.startswith(prefix + "/"):
                return True
    return False


def user_has_consultation_access(allowed_pages: set[str]) -> bool:
    """True when the user holds any consultation module page (room, start, referrals, etc.)."""
    for page in allowed_pages:
        normalized = normalize_role_page_path(page)
        if normalized == "/consultation" or normalized.startswith("/consultation/"):
            return True
    return False
