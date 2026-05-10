"""Project-wide Django middleware.

* ``LegacyApiDeprecationMiddleware`` — RFC 8594 ``Deprecation``/``Sunset``
  headers for the un-versioned ``/api/`` URL alias. Scheduled for
  removal at ``LEGACY_API_SUNSET_DATE`` in ``settings.py``.
* ``ApiTimingMiddleware`` — rolling 5-minute response time + error rate
  buckets in the cache, consumed by the admin dashboard
  ``/common/metrics/`` endpoint so the Performance Metrics card can
  show real values instead of "Not connected".
"""

from __future__ import annotations

import time
from typing import Callable

from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest, HttpResponse


class LegacyApiDeprecationMiddleware:
    """Attach RFC 8594 deprecation headers to responses served under the
    un-versioned ``/api/`` alias.

    Responses served under ``/api/v1/``, ``/api/schema/``, ``/api/docs/``
    and ``/api/redoc/`` are left untouched because they are the canonical
    (non-deprecated) paths.
    """

    _LEGACY_EXCLUDED_PREFIXES = (
        "/api/v1/",
        "/api/schema",
        "/api/docs",
        "/api/redoc",
    )

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response
        self.sunset_date = getattr(settings, "LEGACY_API_SUNSET_DATE", None)

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        path = request.path
        if path.startswith("/api/") and not path.startswith(self._LEGACY_EXCLUDED_PREFIXES):
            # RFC 8594 — Deprecation/Sunset headers. `Link: rel="successor-version"`
            # tells clients exactly which endpoint to migrate to.
            response["Deprecation"] = "true"
            if self.sunset_date:
                response["Sunset"] = self.sunset_date
            canonical = path.replace("/api/", "/api/v1/", 1)
            response["Link"] = f'<{canonical}>; rel="successor-version"'
        return response


# ---------------------------------------------------------------------------
# Response time + error rate sampling for the admin dashboard.
# ---------------------------------------------------------------------------

API_TIMING_CACHE_PREFIX = "api_timing"
API_TIMING_BUCKET_SECONDS = 60
API_TIMING_WINDOW_BUCKETS = 5  # Rolling 5-minute average
API_TIMING_BUCKET_TTL = (API_TIMING_WINDOW_BUCKETS + 2) * API_TIMING_BUCKET_SECONDS


def _timing_bucket_key(field: str, minute_epoch: int) -> str:
    return f"{API_TIMING_CACHE_PREFIX}:{field}:{minute_epoch}"


class ApiTimingMiddleware:
    """Record per-minute response time and error counters for the
    admin dashboard.

    For every API request we update three cache counters in the bucket
    keyed by ``floor(now / 60)``:

    * ``sum_ms``  — total wall-clock duration (ms) of all requests
    * ``count``   — number of requests
    * ``errors``  — number of responses with status ≥ 500

    The dashboard reads the last 5 buckets and computes
    ``sum(sum_ms) / sum(count)`` for "Response Time" and
    ``sum(errors) / sum(count) * 100`` for "Error Rate". When the
    window has no traffic, the metrics endpoint omits the key entirely
    so the UI falls back to "Not connected" instead of showing a
    misleading zero.

    Skipped paths:
      * the timing/metrics endpoint itself (avoids self-measurement)
      * health probes (`/health/`, `/api/health/`)
      * static / media file paths (not interesting for API perf)
    """

    _SKIP_PREFIXES = (
        "/health",
        "/api/health",
        "/api/v1/health",
        "/api/common/metrics",
        "/api/v1/common/metrics",
        "/api/common/dashboard/live",
        "/api/v1/common/dashboard/live",
        "/static/",
        "/media/",
    )

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def _should_record(self, path: str) -> bool:
        # Only track API traffic; skip django admin, static, media,
        # health probes, and the metrics endpoint itself.
        if not path.startswith("/api/"):
            return False
        for prefix in self._SKIP_PREFIXES:
            if path.startswith(prefix):
                return False
        return True

    def __call__(self, request: HttpRequest) -> HttpResponse:
        path = request.path
        track = self._should_record(path)
        start = time.perf_counter() if track else None

        response = self.get_response(request)

        if track and start is not None:
            try:
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                minute_epoch = int(time.time() // API_TIMING_BUCKET_SECONDS)
                self._record(minute_epoch, elapsed_ms, response.status_code)
            except Exception:
                # Never let a metrics-write break a real response.
                pass

        return response

    @staticmethod
    def _record(minute_epoch: int, elapsed_ms: int, status_code: int) -> None:
        sum_key = _timing_bucket_key("sum_ms", minute_epoch)
        count_key = _timing_bucket_key("count", minute_epoch)

        # ``cache.add`` returns True on first write; that's our cue to
        # set the TTL. Subsequent ``incr`` calls keep the value but
        # don't extend the TTL (which is exactly what we want — old
        # buckets must expire so they drop out of the rolling window).
        try:
            if cache.add(count_key, 0, timeout=API_TIMING_BUCKET_TTL):
                pass
            cache.incr(count_key, 1)
        except ValueError:
            # Race: bucket was added but expired between ``add`` and
            # ``incr``. Re-add and retry once.
            cache.add(count_key, 1, timeout=API_TIMING_BUCKET_TTL)

        try:
            if cache.add(sum_key, 0, timeout=API_TIMING_BUCKET_TTL):
                pass
            cache.incr(sum_key, elapsed_ms)
        except ValueError:
            cache.add(sum_key, elapsed_ms, timeout=API_TIMING_BUCKET_TTL)

        if status_code >= 500:
            err_key = _timing_bucket_key("errors", minute_epoch)
            try:
                if cache.add(err_key, 0, timeout=API_TIMING_BUCKET_TTL):
                    pass
                cache.incr(err_key, 1)
            except ValueError:
                cache.add(err_key, 1, timeout=API_TIMING_BUCKET_TTL)


def read_api_timing_window() -> dict:
    """Aggregate the last 5 one-minute buckets.

    Returns ``{ 'avg_ms': int, 'error_rate_pct': float, 'sample': int }``
    when there is at least one sampled request in the window; otherwise
    returns an empty dict so callers can decide whether to omit the
    metric entirely.
    """
    now = int(time.time() // API_TIMING_BUCKET_SECONDS)
    total_count = 0
    total_sum_ms = 0
    total_errors = 0

    for offset in range(API_TIMING_WINDOW_BUCKETS):
        minute = now - offset
        count = cache.get(_timing_bucket_key("count", minute), 0) or 0
        sum_ms = cache.get(_timing_bucket_key("sum_ms", minute), 0) or 0
        errors = cache.get(_timing_bucket_key("errors", minute), 0) or 0
        total_count += int(count)
        total_sum_ms += int(sum_ms)
        total_errors += int(errors)

    if total_count <= 0:
        return {}
    return {
        "avg_ms": round(total_sum_ms / total_count),
        "error_rate_pct": round((total_errors / total_count) * 100, 2),
        "sample": total_count,
    }
