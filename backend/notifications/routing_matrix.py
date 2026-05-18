"""
Central notification audience routing matrix.

Defaults live in ``ROLE_DEPARTMENT_HINTS``. Admins may overlay changes via
``PATCH /api/v1/notifications/routing-matrix/`` (stored in the default cache
backend, merged on read with these defaults).
"""

from typing import Dict, List

from django.core.cache import cache

# Role -> department routing hints. We allow both department code and
# readable name to tolerate naming differences across deployments.
ROLE_DEPARTMENT_HINTS: Dict[str, List[str]] = {
    "Medical Doctor": ["CONSULT", "Consultation"],
    "Nursing Officer": ["NURSING", "Nursing"],
    "Laboratory Scientist": ["LAB", "Laboratory"],
    "Radiologist": ["RAD", "Radiology"],
    "Pharmacist": ["PHARM", "Pharmacy"],
    "Medical Records Officer": ["MED-REC", "Medical Records"],
    "Physiotherapist": ["PHYSIO", "Physiotherapy"],
    "Optamologist": ["EYE", "Eye Clinic"],
}

ROUTING_MATRIX_CACHE_KEY = "notifications:routing_matrix:v1"
# Long-lived overlay; cleared explicitly via DELETE or empty PATCH.
_ROUTING_MATRIX_TTL_SECONDS = 60 * 60 * 24 * 365 * 10


def _default_matrix() -> Dict[str, List[str]]:
    return dict(ROLE_DEPARTMENT_HINTS)


def _normalize_matrix_payload(raw: dict) -> Dict[str, List[str]]:
    """Coerce API/cache payload to role -> list[str]."""
    out: Dict[str, List[str]] = {}
    if not isinstance(raw, dict):
        return out
    for k, v in raw.items():
        key = str(k).strip()
        if not key:
            continue
        if isinstance(v, (list, tuple)):
            out[key] = [str(x).strip() for x in v if str(x).strip()]
        elif v is None:
            out[key] = []
        else:
            s = str(v).strip()
            out[key] = [s] if s else []
    return out


def routing_matrix_has_override() -> bool:
    cached = cache.get(ROUTING_MATRIX_CACHE_KEY)
    return isinstance(cached, dict) and bool(cached)


def get_routing_matrix() -> Dict[str, List[str]]:
    """
    Effective matrix: defaults merged with optional cache overlay.

    A partial overlay only replaces keys present in the cache; other roles
    keep file defaults.
    """
    base = _default_matrix()
    cached = cache.get(ROUTING_MATRIX_CACHE_KEY)
    if not isinstance(cached, dict) or not cached:
        return base
    merged = dict(base)
    merged.update(_normalize_matrix_payload(cached))
    return merged


def set_routing_matrix_override(matrix: dict) -> Dict[str, List[str]]:
    """
    Persist a partial or full overlay. Empty payload clears the overlay.
    Returns the effective merged matrix after the operation.
    """
    normalized = _normalize_matrix_payload(matrix)
    if not normalized:
        clear_routing_matrix_override()
        return _default_matrix()
    cache.set(
        ROUTING_MATRIX_CACHE_KEY,
        normalized,
        timeout=_ROUTING_MATRIX_TTL_SECONDS,
    )
    return get_routing_matrix()


def clear_routing_matrix_override() -> None:
    cache.delete(ROUTING_MATRIX_CACHE_KEY)


def get_department_hints_for_role(role_name: str) -> List[str]:
    """Return routing hints for a role; empty list means no department filter."""
    return get_routing_matrix().get(role_name, [])

