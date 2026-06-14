"""
Resolve the set of UI page paths a user may access (roles + per-user overrides).
"""
from __future__ import annotations

from permissions.page_catalog import ALL_PAGE_IDS
from permissions.page_paths import GLOBAL_USER_PAGES, normalize_role_page_path
from permissions.role_permissions import normalize_role_permissions_list

SUPERUSER_PAGES = frozenset({"__superuser__"})
ADMIN_ROLE_PAGES = frozenset({"__admin__"})


def _apply_page_overrides(user, role_pages: set[str]) -> set[str]:
    mode = (getattr(user, "custom_pages_mode", "") or "").strip()
    custom = getattr(user, "custom_pages", None)
    custom_pages = {normalize_role_page_path(p) for p in custom if isinstance(p, str)} if isinstance(custom, list) else set()

    if mode == "replace":
        return set(custom_pages)
    if mode == "add":
        return set(role_pages) | set(custom_pages)
    if mode == "restrict":
        return set(role_pages) - set(custom_pages)
    return set(role_pages)


def get_user_allowed_pages(user) -> set[str]:
    """
    Return normalized page paths for ``user``.

    Result is cached on the user instance for the lifetime of the request.
    """
    cache_attr = "_cached_allowed_pages"
    cached = getattr(user, cache_attr, None)
    if cached is not None:
        return cached

    if not user or not getattr(user, "is_authenticated", False):
        setattr(user, cache_attr, set())
        return getattr(user, cache_attr)

    if getattr(user, "is_superuser", False):
        setattr(user, cache_attr, {"__superuser__"})
        return getattr(user, cache_attr)

    allowed: set[str] = set(GLOBAL_USER_PAGES)

    user_roles = getattr(user, "user_roles", None)
    if user_roles is not None:
        roles_qs = user_roles.all()
    else:
        from permissions.models import UserRole

        roles_qs = UserRole.objects.filter(user=user).select_related("role")

    for user_role in roles_qs:
        role = user_role.role
        if role is None or not role.is_active:
            continue
        if role.type == "admin":
            setattr(user, cache_attr, {"__admin__"})
            return getattr(user, cache_attr)

        for page in normalize_role_permissions_list(role.permissions):
            allowed.add(normalize_role_page_path(page))

    allowed = _apply_page_overrides(user, allowed)
    setattr(user, cache_attr, allowed)
    return allowed


def get_user_allowed_pages_for_response(user) -> list[str]:
    """Page list for ``/auth/me`` and login payloads (no internal sentinels)."""
    pages = get_user_allowed_pages(user)
    if pages & SUPERUSER_PAGES or pages & ADMIN_ROLE_PAGES:
        return sorted(ALL_PAGE_IDS)
    return sorted(pages)
