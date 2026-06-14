"""
DRF permission classes for page-based RBAC.
"""
from __future__ import annotations

from rest_framework.permissions import BasePermission, IsAuthenticated

from permissions.api_access import check_api_page_access, normalize_api_path
from permissions.user_pages import get_user_allowed_pages


class ApiPageAccessPermission(BasePermission):
    """
    Enforce role page permissions on API requests (mirrors frontend middleware).

    Set ``page_access_exempt = True`` on a view to skip this check while still
    requiring authentication.
    """

    message = "You do not have permission to perform this action in this module."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return True

        if getattr(user, "is_superuser", False):
            return True

        if getattr(view, "page_access_exempt", False):
            return True

        required_pages = getattr(view, "required_pages", None)
        allowed = get_user_allowed_pages(user)
        if required_pages:
            from permissions.page_paths import user_has_any_page

            return user_has_any_page(allowed, required_pages)

        api_path = normalize_api_path(request.path)
        return check_api_page_access(api_path, request.method, allowed)


AuthenticatedWithPageAccess = [IsAuthenticated, ApiPageAccessPermission]
