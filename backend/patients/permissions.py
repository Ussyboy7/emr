"""Patient record permission helpers."""
from __future__ import annotations

from permissions.user_management import manages_department


def is_system_admin_user(user) -> bool:
    """Superuser or System Administrator / Admin Staff system role."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    role = (getattr(user, "system_role", "") or "").strip().lower()
    return role in {"system administrator", "admin staff"}


def can_manage_patient_lifecycle(user) -> bool:
    """Employee→Retiree, Staff→Officer promote, Retiree→CSR: admins or dept head/deputy."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if is_system_admin_user(user):
        return True
    return manages_department(user)


def requires_lifecycle_category_change(old_category: str, new_category: str) -> bool:
    """PATCH category changes that must use lifecycle permissions."""
    return old_category == "employee" and new_category == "retiree"
