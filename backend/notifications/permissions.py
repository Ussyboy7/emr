"""Permissions for notification administration."""

from rest_framework.permissions import BasePermission


class CanManageNotificationRouting(BasePermission):
    """
    Staff/superuser or System Administrator (clinical admin role).

    Matches how other admin surfaces gate privileged operations without
    requiring every admin to be Django ``is_staff``.
    """

    message = "You do not have permission to manage notification routing."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            return True
        role = (getattr(user, "system_role", None) or "").strip().lower()
        return role == "system administrator"
