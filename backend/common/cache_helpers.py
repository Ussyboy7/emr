"""Short-lived cache helpers for dashboard and stats endpoints."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar

from django.core.cache import cache

T = TypeVar("T")

DEFAULT_STATS_TTL = int(__import__("os").getenv("STATS_CACHE_TTL_SECONDS", "45"))


def cache_get_or_set(key: str, builder: Callable[[], T], ttl: int = DEFAULT_STATS_TTL) -> T:
    cached = cache.get(key)
    if cached is not None:
        return cached
    value = builder()
    cache.set(key, value, ttl)
    return value


def invalidate_prefix(prefix: str) -> None:
    """Best-effort invalidation when the backend supports key patterns."""
    try:
        cache.delete_pattern(f"{prefix}*")  # type: ignore[attr-defined]
    except Exception:
        pass
