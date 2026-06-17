"""
Helpers for resolving a user's primary access role (UserRole → Role).
"""
from __future__ import annotations

from permissions.models import UserRole


def get_primary_user_role(user):
    """Return the most recently assigned active access role, if any."""
    if user is None:
        return None

    prefetched = getattr(user, "_prefetched_objects_cache", None)
    if prefetched and "user_roles" in prefetched:
        for user_role in user.user_roles.all():
            role = user_role.role
            if role is not None and role.is_active:
                return user_role
        return None

    return (
        UserRole.objects.filter(user=user, role__is_active=True)
        .select_related("role")
        .order_by("-assigned_at")
        .first()
    )


def sync_system_role_from_access_role(user, *, save: bool = True) -> bool:
    """
    Mirror the primary access role name onto ``User.system_role`` for legacy display.

    Returns True when ``system_role`` was updated.
    """
    user_role = get_primary_user_role(user)
    new_name = user_role.role.name if user_role and user_role.role else ""
    if (user.system_role or "") == new_name:
        return False
    user.system_role = new_name
    if save:
        user.save(update_fields=["system_role"])
    return True
