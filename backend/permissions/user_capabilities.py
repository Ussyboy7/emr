"""
Resolve effective capability grants for a user (pages + explicit role capabilities).
"""
from __future__ import annotations

from permissions.capabilities import ALL_CAPABILITY_IDS, PAGE_TO_CAPABILITIES
from permissions.page_paths import normalize_role_page_path
from permissions.role_permissions import normalize_role_capabilities_list, normalize_role_permissions_list
from permissions.user_pages import get_user_allowed_pages, SUPERUSER_PAGES, ADMIN_ROLE_PAGES


def _capabilities_from_pages(pages: set[str]) -> set[str]:
    caps: set[str] = set()
    for page in pages:
        norm = normalize_role_page_path(page)
        caps |= set(PAGE_TO_CAPABILITIES.get(norm, frozenset()))
        for prefix, implied in PAGE_TO_CAPABILITIES.items():
            if norm == prefix or norm.startswith(prefix + "/"):
                caps |= set(implied)
    return caps


def _explicit_capabilities_from_roles(user) -> set[str]:
    caps: set[str] = set()
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
        caps |= set(normalize_role_capabilities_list(role.permissions))
    return caps


def get_user_capabilities(user) -> set[str]:
    """Return normalized capability IDs for ``user`` (cached per request)."""
    cache_attr = "_cached_capabilities"
    cached = getattr(user, cache_attr, None)
    if cached is not None:
        return cached

    if not user or not getattr(user, "is_authenticated", False):
        setattr(user, cache_attr, set())
        return getattr(user, cache_attr)

    pages = get_user_allowed_pages(user)
    if pages & SUPERUSER_PAGES or pages & ADMIN_ROLE_PAGES:
        setattr(user, cache_attr, set(ALL_CAPABILITY_IDS))
        return getattr(user, cache_attr)

    allowed = _capabilities_from_pages(pages)
    allowed |= _explicit_capabilities_from_roles(user)
    setattr(user, cache_attr, allowed)
    return allowed


def get_user_capabilities_for_response(user) -> list[str]:
    return sorted(get_user_capabilities(user))


def user_has_capability(user, capability_id: str) -> bool:
    if not capability_id:
        return False
    if getattr(user, "is_superuser", False):
        return True
    return capability_id in get_user_capabilities(user)


def build_effective_access_for_role(role) -> dict:
    """Preview pages, capabilities, and API families for a single access role."""
    from permissions.capabilities import CAPABILITY_CATALOG, PAGE_API_FAMILIES

    pages = normalize_role_permissions_list(role.permissions)
    page_set = set(pages)
    explicit = set(normalize_role_capabilities_list(role.permissions))
    implied = _capabilities_from_pages(page_set)
    if role.type == "admin":
        caps = set(ALL_CAPABILITY_IDS)
    else:
        caps = explicit | implied

    api_families: list[dict] = []
    for page in sorted(page_set):
        for pattern, methods, note in PAGE_API_FAMILIES.get(page, ()):
            api_families.append({"page": page, "pattern": pattern, "methods": methods, "note": note})

    catalog_by_id = {c[0]: {"id": c[0], "name": c[1], "module": c[2], "description": c[3]} for c in CAPABILITY_CATALOG}

    return {
        "pages": sorted(page_set),
        "capabilities": sorted(caps),
        "explicit_capabilities": sorted(explicit),
        "implied_capabilities": sorted(implied - explicit),
        "capability_details": [catalog_by_id[c] for c in sorted(caps) if c in catalog_by_id],
        "api_families": api_families,
    }
