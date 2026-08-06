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
            location_clinic__code=CENTRAL_STORE_CLINIC_CODE,
            code=PHARMACY_DEPARTMENT_CODE,
            is_active=True,
        )
        .select_related("head", "location_clinic")
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


def stock_request_involves_hod_store(from_location: str | None, to_location: str | None) -> bool:
    return is_hod_store_location(from_location) or is_hod_store_location(to_location)


def stock_request_involves_central_store(from_location: str | None, to_location: str | None) -> bool:
    return is_central_store_location(from_location) or is_central_store_location(to_location)


def user_can_operate_hod_store(user) -> bool:
    """Mutations on HOD store inventory, requests, and dispensing."""
    return user_is_pharmacy_hod(user)


def _is_store_to_requester_location(from_location: str | None, to_location: str | None) -> bool:
    """Store → Dispensary or Ward Care (requester sites, not operators)."""
    if not is_central_store_location(from_location):
        return False
    to_norm = _normalize_location(to_location)
    return "dispensary" in to_norm or "ward" in to_norm


def user_can_request_from_central_store(user) -> bool:
    """Dispensary / ward staff who may order stock from Central Store."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    from permissions.page_paths import is_path_allowed_by_pages
    from permissions.user_pages import get_user_allowed_pages, get_user_denied_pages

    pages = get_user_allowed_pages(user)
    denied = get_user_denied_pages(user)
    return is_path_allowed_by_pages("/pharmacy/requests", pages, denied) or is_path_allowed_by_pages(
        "/nursing/requests", pages, denied
    )


def user_can_operate_stock_request(user, from_location: str | None, to_location: str | None) -> bool:
    """Approve, fulfill, reject, or edit stock requests (warehouse / HOD operators)."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True

    involves_hod = stock_request_involves_hod_store(from_location, to_location)
    involves_central = stock_request_involves_central_store(from_location, to_location)

    if involves_hod and user_can_operate_hod_store(user):
        return True
    if involves_central:
        from pharmacy.central_store import user_can_manage_central_store_stock_requests

        return user_can_manage_central_store_stock_requests(user)
    if involves_hod:
        from pharmacy.central_store import user_can_manage_central_store_stock_requests

        return user_can_manage_central_store_stock_requests(user)
    return False


def user_can_access_stock_request(
    user,
    from_location: str | None,
    to_location: str | None,
    *,
    operation: str = "read",
) -> bool:
    """Read/create/confirm vs operator mutations for stock requests touching Central or HOD store."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True

    involves_hod = stock_request_involves_hod_store(from_location, to_location)
    involves_central = stock_request_involves_central_store(from_location, to_location)

    if not involves_hod and not involves_central:
        return True

    if operation in ("read", "create", "confirm"):
        if user_can_operate_stock_request(user, from_location, to_location):
            return True
        if involves_central and _is_store_to_requester_location(from_location, to_location):
            return user_can_request_from_central_store(user)
        if involves_hod and user_can_operate_hod_store(user):
            return True
        return False

    return user_can_operate_stock_request(user, from_location, to_location)
