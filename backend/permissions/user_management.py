"""Department-scoped user management helpers and DRF permissions."""
from __future__ import annotations

from django.db.models import Q, QuerySet
from rest_framework.permissions import BasePermission

from permissions.page_paths import user_has_any_page
from permissions.user_pages import get_user_allowed_pages

USER_MANAGEMENT_PAGES = ("/admin/users", "/admin")


def managed_departments_qs(user):
    """Active departments where ``user`` is head or deputy head."""
    from organization.models import Department

    if not user or not getattr(user, "is_authenticated", False):
        return Department.objects.none()
    return (
        Department.objects.filter(is_active=True)
        .filter(Q(head=user) | Q(deputy_head=user))
        .order_by("name")
    )


def headed_departments_for_user(user) -> list[dict[str, int | str]]:
    """Departments the user manages (head or deputy) — for UI scoping."""
    return list(managed_departments_qs(user).values("id", "name"))


def is_department_head(user) -> bool:
    """True when a non-staff user is head or deputy of at least one active department."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return False
    return manages_department(user)


def manages_department(user) -> bool:
    """True when user is head or deputy of at least one active department."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return managed_departments_qs(user).exists()


def is_department_deputy_only(user) -> bool:
    """True when user is deputy but not primary head of any active department."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return False
    has_deputy = user.departments_deputied.filter(is_active=True).exists()
    has_head = user.departments_led.filter(is_active=True).exists()
    return has_deputy and not has_head


def user_has_user_management_page(user) -> bool:
    allowed = get_user_allowed_pages(user)
    return bool(user_has_any_page(allowed, USER_MANAGEMENT_PAGES))


def can_manage_users(user) -> bool:
    """ICT staff, superuser, or department head/deputy with User Management page access."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True
    return is_department_head(user) and user_has_user_management_page(user)


def managed_department_ids(user) -> set[int] | None:
    """
    Return department ids the user may manage, or None for unrestricted (superuser).

    - Superuser: None (all departments)
    - Staff (non-superuser): own department only
    - Department head/deputy (non-staff): departments they lead
    """
    if not user or not getattr(user, "is_authenticated", False):
        return set()
    if getattr(user, "is_superuser", False):
        return None
    if getattr(user, "is_staff", False):
        if user.department_id:
            return {user.department_id}
        return set()
    return set(managed_departments_qs(user).values_list("id", flat=True))


def filter_users_by_managed_departments(
    queryset: QuerySet, user, *, user_field: str = ""
) -> QuerySet:
    dept_ids = managed_department_ids(user)
    if dept_ids is None:
        return queryset
    if not dept_ids:
        return queryset.none()
    dept_lookup = f"{user_field}__department_id__in" if user_field else "department_id__in"
    return queryset.filter(**{dept_lookup: dept_ids})


def assert_user_in_managed_departments(actor, target_user) -> None:
    from rest_framework.exceptions import PermissionDenied

    dept_ids = managed_department_ids(actor)
    if dept_ids is None:
        return
    if not dept_ids:
        raise PermissionDenied("Your account cannot manage users.")
    if target_user.department_id not in dept_ids:
        raise PermissionDenied("You can only manage users within your department(s).")


def assert_department_id_managed(actor, department_id: int | None) -> None:
    from rest_framework.exceptions import PermissionDenied

    if department_id is None:
        return
    dept_ids = managed_department_ids(actor)
    if dept_ids is None:
        return
    if department_id not in dept_ids:
        raise PermissionDenied("You cannot assign users to that department.")


class CanManageUsers(BasePermission):
    """Manage users in scope: superuser, ICT staff, or department head/deputy with page access."""

    message = "You do not have permission to manage users."

    def has_permission(self, request, view) -> bool:
        return can_manage_users(request.user)


class CanManageRoles(BasePermission):
    """Full role CRUD — ICT staff / superuser only."""

    message = "You do not have permission to manage roles."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return bool(user.is_superuser or user.is_staff)
