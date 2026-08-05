"""
Utility for resolving a user's effective facility.

Facility = physical site (HQ, Bode Thomas, Apapa). Do NOT confuse with
``OutpatientClinicType`` (GOPD, Eye, Physio) — a clinic type, not a boundary.
"""
from organization.models import SystemConfig


def resolve_facility(user):
    """
    Get the effective clinic for a user based on multi-clinic mode.

    When multi_clinic_enabled is True:
        - Returns user.active_clinic if set
        - Falls back to user.clinic (home clinic)
    When multi_clinic_enabled is False:
        - Returns user.clinic (unchanged behavior)
    """
    if not user or not user.is_authenticated:
        return None
    if SystemConfig.is_enabled('multi_clinic_enabled'):
        return user.active_clinic or user.clinic
    return user.clinic


def resolve_facility_id(user):
    """Get the effective facility ID for a user (same logic as resolve_facility)."""
    facility = resolve_facility(user)
    return facility.id if facility else None


# Backward-compatible aliases. Migrations and any extensions still importing
# the historical ``resolve_clinic`` / ``resolve_clinic_id`` names keep working.
# New code must use the facility names.
resolve_clinic = resolve_facility
resolve_clinic_id = resolve_facility_id
