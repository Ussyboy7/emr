"""
Central store (warehouse) is hosted at Bode Thomas Clinic.
"""
from __future__ import annotations

CENTRAL_STORE_CLINIC_CODE = "BODE-THOMAS"


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
    if getattr(user, "location_clinic_id", None) == clinic_id:
        return True
    clinics = getattr(user, "location_clinics", None)
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
    from accounts.utils import resolve_facility_id

    return resolve_facility_id(user) == clinic_id


def user_has_central_store_requests_page(user) -> bool:
    """Store / store-requests UI pages for central warehouse workflows."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    from permissions.page_paths import is_path_allowed_by_pages
    from permissions.user_pages import get_user_allowed_pages, get_user_denied_pages

    pages = get_user_allowed_pages(user)
    denied = get_user_denied_pages(user)
    return is_path_allowed_by_pages("/pharmacy/store/requests", pages, denied) or is_path_allowed_by_pages(
        "/pharmacy/store", pages, denied
    )


def user_can_manage_central_store_stock_requests(user) -> bool:
    """
    Approve, fulfill, or reject stock requests involving Central Store.

    Active clinic at Bode Thomas is sufficient; otherwise assigned to Bode Thomas
    with store page access (or Pharmacy Head) — so store staff can approve without
    switching clinic away from their dispensary site.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    if user_can_operate_central_store(user):
        return True
    if not user_assigned_to_central_store(user):
        return False
    if user_has_central_store_requests_page(user):
        return True
    from pharmacy.hod_store import user_is_pharmacy_hod

    return user_is_pharmacy_hod(user)
