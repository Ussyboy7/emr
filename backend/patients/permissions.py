"""Patient record permission helpers."""
from __future__ import annotations

from permissions.user_capabilities import user_has_capability
from permissions.user_management import manages_department


def is_system_admin_user(user) -> bool:
    """Superuser or holders of sensitive patient admin capabilities."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    return user_has_capability(user, "patient_delete") or user_has_capability(user, "patient_merge")


def can_manage_patient_lifecycle(user) -> bool:
    """Employee→Retiree, Staff→Officer, Retiree→CSR: capability or dept head/deputy."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    if user_has_capability(user, "patient_convert_csr"):
        return True
    if user_has_capability(user, "patient_promote_officer"):
        return True
    if user_has_capability(user, "patient_convert_retiree"):
        return True
    return manages_department(user)


def can_delete_patient(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    return user_has_capability(user, "patient_delete")


def can_merge_patient(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    return user_has_capability(user, "patient_merge")


def can_unmerge_patient(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    return user_has_capability(user, "patient_unmerge")


def requires_lifecycle_category_change(old_category: str, new_category: str) -> bool:
    """PATCH category changes that must use lifecycle permissions."""
    return old_category == "employee" and new_category == "retiree"
