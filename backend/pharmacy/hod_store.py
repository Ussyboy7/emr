"""
Pharmacy HOD Store — inventory pool for the Head of Pharmacy at Bode Thomas Clinic.

Access: primary department head only (not deputy) + superuser.
"""
from __future__ import annotations

from pharmacy.central_store import CENTRAL_STORE_CLINIC_CODE

HOD_STORE_LOCATION = "HOD Store"
PHARMACY_DEPARTMENT_CODE = "PHARM"


def _normalize_location(loc: str | None) -> str:
    return (loc or "").strip().lower()


def is_hod_store_location(loc: str | None) -> bool:
    return _normalize_location(loc) == _normalize_location(HOD_STORE_LOCATION)


def is_central_store_location(loc: str | None) -> bool:
    """True for the main warehouse location only (not HOD Store)."""
    normalized = _normalize_location(loc)
    return normalized == "store"


def get_pharmacy_department():
    from organization.models import Department

    return (
        Department.objects.filter(
            clinic__code=CENTRAL_STORE_CLINIC_CODE,
            code=PHARMACY_DEPARTMENT_CODE,
            is_active=True,
        )
        .select_related("head", "clinic")
        .first()
    )


def user_is_pharmacy_hod(user) -> bool:
    """True when user is the primary head of Pharmacy at Bode Thomas (not deputy)."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    dept = get_pharmacy_department()
    if not dept or not dept.head_id:
        return False
    return dept.head_id == user.id


def user_can_operate_hod_store(user) -> bool:
    """Mutations on HOD store inventory, requests, and dispensing."""
    return user_is_pharmacy_hod(user)


def stock_request_involves_hod_store(from_location: str | None, to_location: str | None) -> bool:
    return is_hod_store_location(from_location) or is_hod_store_location(to_location)


def stock_request_involves_central_store(from_location: str | None, to_location: str | None) -> bool:
    return is_central_store_location(from_location) or is_central_store_location(to_location)


def user_can_access_stock_request(user, from_location: str | None, to_location: str | None) -> bool:
    """Read/write stock requests that touch Central Store and/or HOD Store."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True

    involves_hod = stock_request_involves_hod_store(from_location, to_location)
    involves_central = stock_request_involves_central_store(from_location, to_location)

    if involves_hod and user_can_operate_hod_store(user):
        return True
    if involves_central:
        from pharmacy.central_store import user_can_operate_central_store

        return user_can_operate_central_store(user)
    if involves_hod:
        return False
    from pharmacy.central_store import user_can_operate_central_store

    return user_can_operate_central_store(user)
