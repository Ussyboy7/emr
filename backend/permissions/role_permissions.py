"""
Canonical shape for Role.permissions: a JSON array of page path strings, e.g. ["/consultation", ...].

The admin UI may send {"pages": [...]}; we always persist and expose a plain list.
"""


def normalize_role_permissions_list(raw) -> list:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [p for p in raw if isinstance(p, str)]
    if isinstance(raw, dict):
        pages = raw.get("pages")
        if isinstance(pages, list):
            return [p for p in pages if isinstance(p, str)]
    return []
