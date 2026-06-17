"""
Canonical shape for Role.permissions: a JSON array of page path strings, e.g. ["/consultation", ...].

The admin UI may send {"pages": [...], "capabilities": [...]}; pages are always normalized.
"""

from permissions.page_paths import normalize_role_page_path


def normalize_role_permissions_list(raw) -> list:
    if raw is None:
        return []

    if isinstance(raw, dict):
        raw = raw.get("pages")

    if not isinstance(raw, list):
        return []

    out: list[str] = []
    seen: set[str] = set()
    for p in raw:
        if not isinstance(p, str):
            continue
        norm = normalize_role_page_path(p)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        out.append(norm)
    return out


def normalize_role_capabilities_list(raw) -> list[str]:
    if raw is None:
        return []
    caps_raw = None
    if isinstance(raw, dict):
        caps_raw = raw.get("capabilities")
    if not isinstance(caps_raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for c in caps_raw:
        if not isinstance(c, str):
            continue
        cid = c.strip()
        if not cid or cid in seen:
            continue
        seen.add(cid)
        out.append(cid)
    return out


def normalize_role_permissions_payload(raw) -> list | dict:
    """Persist pages as a list, or {pages, capabilities} when capabilities are set."""
    pages = normalize_role_permissions_list(raw)
    caps = normalize_role_capabilities_list(raw)
    if caps:
        return {"pages": pages, "capabilities": caps}
    return pages
