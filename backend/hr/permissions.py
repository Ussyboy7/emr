"""HR API permissions — bounded access separate from clinical annual-checkup endpoints."""

from rest_framework.permissions import BasePermission

from permissions.user_capabilities import user_has_capability


class IsHumanResources(BasePermission):
    """HR compliance capability or superuser."""

    message = "Human Resources access required."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return user_has_capability(user, "hr_compliance_manage")
