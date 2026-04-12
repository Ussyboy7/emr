"""
Utility functions for clinic name normalization in the backend.

Canonical visit-clinic names come from organization.OutpatientClinicType (active rows).
Optional aliases map legacy/free-text inputs to strings that are then matched against
the database for correct casing.
"""

from __future__ import annotations

import time
from typing import Optional

# TTL for the in-process OPD type caches (invalidated on OutpatientClinicType save/delete).
_ACTIVE_OPD_NAMES_TTL_SEC = 60.0
_active_opd_names_cache: Optional[list[str]] = None
_active_opd_code_to_name: Optional[dict[str, str]] = None
_active_opd_names_cache_mono: float = 0.0

# Map common free-text / legacy inputs to a target name; target is then matched against
# active OutpatientClinicType rows (case-insensitive). Not a master clinic roster.
CLINIC_NAME_ALIASES: dict[str, str] = {
    # Eye / ophthalmology → canonical "Eye Clinic" (matches default OutpatientClinicType seed)
    "eye": "Eye Clinic",
    "eye clinic": "Eye Clinic",
    "eyecare": "Eye Clinic",
    "ophthalmology": "Eye Clinic",
    "ophthalmology clinic": "Eye Clinic",
    "sickle cell": "Sickle Cell",
    "sickle cell clinic": "Sickle Cell",
    "diamond": "Diamond",
    "diamond club": "Diamond",
    "diamond club clinic": "Diamond",
    "physiotherapy": "Physiotherapy",
    "physiotherapy clinic": "Physiotherapy",
    # General OPD → canonical "GOPD"
    "general": "GOPD",
    "general clinic": "GOPD",
    "general outpatient": "GOPD",
    "general out-patient": "GOPD",
    "general opd": "GOPD",
    "gen opd": "GOPD",
    "g.o.p": "GOPD",
    "g.o.p.": "GOPD",
    "g.o.p.d": "GOPD",
    "g.o.p.d.": "GOPD",
    "gop": "GOPD",
    "gopd": "GOPD",
    "healthron": "Healthron",
    "healthron clinic": "Healthron",
    "dental": "Dental",
    "dental clinic": "Dental",
    "dentistry": "Dental",
}


def invalidate_outpatient_clinic_name_cache() -> None:
    """Clear cached active clinic type names (e.g. after admin edits types)."""
    global _active_opd_names_cache, _active_opd_names_cache_mono, _active_opd_code_to_name
    _active_opd_names_cache = None
    _active_opd_code_to_name = None
    _active_opd_names_cache_mono = 0.0


def _ensure_opd_caches_loaded() -> None:
    global _active_opd_names_cache, _active_opd_names_cache_mono, _active_opd_code_to_name
    now = time.monotonic()
    if (
        _active_opd_names_cache is not None
        and _active_opd_code_to_name is not None
        and (now - _active_opd_names_cache_mono) < _ACTIVE_OPD_NAMES_TTL_SEC
    ):
        return
    try:
        from organization.models import OutpatientClinicType

        rows = list(
            OutpatientClinicType.objects.filter(is_active=True).values_list("code", "name")
        )
        _active_opd_code_to_name = {
            str(c).strip().lower(): str(n) for c, n in rows if c is not None and n
        }
        _active_opd_names_cache = list(dict.fromkeys(str(n) for _, n in rows if n))
    except Exception:
        _active_opd_code_to_name = {}
        _active_opd_names_cache = []
    _active_opd_names_cache_mono = now


def _get_active_outpatient_type_names() -> list[str]:
    _ensure_opd_caches_loaded()
    return _active_opd_names_cache or []


def active_opd_service_matches_code(raw: Optional[str], type_code: str) -> bool:
    """
    True if `raw` normalizes to the same display name as the active OutpatientClinicType
    with the given `code` (e.g. \"eye-clinic\", \"physiotherapy\").
    """
    _ensure_opd_caches_loaded()
    ckey = (type_code or "").strip().lower()
    target = (_active_opd_code_to_name or {}).get(ckey)
    if not target:
        return False
    return normalize_clinic_name(raw or "").lower() == target.lower()


def _resolve_name_case_insensitive(needle: str, active_names: list[str]) -> Optional[str]:
    if not needle or not needle.strip():
        return None
    nl = needle.strip().lower()
    for n in active_names:
        if n and n.lower() == nl:
            return n
    return None


def normalize_clinic_name(clinic: Optional[str]) -> str:
    """
    Normalize clinic name toward an active OutpatientClinicType.name when possible.

    Applies CLINIC_NAME_ALIASES first to the raw string, then resolves case-insensitively
    against active types. If an alias target is not in the database, the alias target
    string is returned (legacy compatibility). Otherwise falls back to simple title case.
    """
    if not clinic or not clinic.strip():
        return ""

    trimmed = clinic.strip()
    title_case = trimmed[0].upper() + trimmed[1:].lower() if trimmed else ""
    active = _get_active_outpatient_type_names()

    hit = _resolve_name_case_insensitive(trimmed, active)
    if hit is not None:
        return hit

    lower = trimmed.lower()
    if lower in CLINIC_NAME_ALIASES:
        candidate = CLINIC_NAME_ALIASES[lower]
        hit = _resolve_name_case_insensitive(candidate, active)
        if hit is not None:
            return hit
        return candidate

    return title_case


def resolve_visit_facility_clinic(visit):
    """
    Resolve organization.Clinic for where the visit takes place (facility/site).

    Uses Visit.location_clinic when set; otherwise matches Visit.location string
    to Clinic.name. This is separate from Visit.clinics (service lines: GOPD, Eye Clinic, etc.).
    """
    # type hint avoid circular import at module level
    from organization.models import Clinic

    if visit is None:
        return None

    fk = getattr(visit, "location_clinic", None)
    if fk is not None and getattr(fk, "is_active", True):
        return fk

    loc = (getattr(visit, "location", None) or "").strip()
    if not loc:
        return None
    return Clinic.objects.filter(name__iexact=loc, is_active=True).first()


def is_valid_clinic(clinic: Optional[str]) -> bool:
    """True if normalize_clinic_name resolves to an active OutpatientClinicType name."""
    if not clinic:
        return False
    normalized = normalize_clinic_name(clinic)
    if not normalized:
        return False
    active = _get_active_outpatient_type_names()
    return _resolve_name_case_insensitive(normalized, active) is not None
