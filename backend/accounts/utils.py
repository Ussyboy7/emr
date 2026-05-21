"""
Utility functions for the Accounts app.
"""
from organization.models import SystemConfig


def resolve_clinic(user):
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


def resolve_clinic_id(user):
    """Get the effective clinic ID for a user (same logic as resolve_clinic)."""
    clinic = resolve_clinic(user)
    return clinic.id if clinic else None
