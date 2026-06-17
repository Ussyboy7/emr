"""Permissions for notification administration."""

from rest_framework.permissions import BasePermission

from permissions.user_capabilities import user_has_capability


class CanManageNotificationRouting(BasePermission):
    """Users with notification_routing_manage capability (or staff/superuser)."""

    message = "You do not have permission to manage notification routing."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            return True
        return user_has_capability(user, "notification_routing_manage")
