"""
Central store (warehouse) is hosted at Bode Thomas Clinic.
"""
from __future__ import annotations

from functools import lru_cache

CENTRAL_STORE_CLINIC_CODE = "BODE-THOMAS"


@lru_cache(maxsize=1)
def get_central_store_clinic_id() -> int | None:
    from organization.models import Clinic

    return Clinic.objects.filter(code=CENTRAL_STORE_CLINIC_CODE).values_list("id", flat=True).first()


def user_assigned_to_central_store(user) -> bool:
    """True when the user's home or assigned clinics include the central store site."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    clinic_id = get_central_store_clinic_id()
    if clinic_id is None:
        return False
    if getattr(user, "clinic_id", None) == clinic_id:
        return True
    clinics = getattr(user, "clinics", None)
    if clinics is not None:
        return clinics.filter(id=clinic_id).exists()
    return False


def user_can_operate_central_store(user) -> bool:
    """True when the user's active clinic is the central store site (API mutations)."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    clinic_id = get_central_store_clinic_id()
    if clinic_id is None:
        return False
    from accounts.utils import resolve_clinic_id

    return resolve_clinic_id(user) == clinic_id
