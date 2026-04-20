"""Project-wide Django middleware.

Currently this module hosts the deprecation signalling for the
un-versioned ``/api/`` URL alias. The alias is retained for backward
compatibility while clients migrate to ``/api/v1/``. It is scheduled for
removal — see ``LEGACY_API_SUNSET_DATE`` in ``settings.py``.
"""

from __future__ import annotations

from typing import Callable

from django.conf import settings
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
