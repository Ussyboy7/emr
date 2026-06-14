"""HR API permissions — bounded access separate from clinical annual-checkup endpoints."""

from rest_framework.permissions import BasePermission

HR_SYSTEM_ROLES = frozenset(
    {
        "Human Resources Officer",
        "Human Resources",
    }
)


class IsHumanResources(BasePermission):
    """Allow HR staff and superusers only."""

    message = "Human Resources access required."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        role = (getattr(user, "system_role", None) or "").strip()
        return role in HR_SYSTEM_ROLES
