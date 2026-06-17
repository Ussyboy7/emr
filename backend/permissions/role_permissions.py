"""
Canonical shape for Role.permissions: a JSON array of page path strings, e.g. ["/consultation", ...].

The admin UI may send {"pages": [...]}; we always persist and expose a plain list.
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
