"""Root URL configuration for the EMR backend."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve as static_serve
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from common.views import health_check, health_live


api_v1_patterns = [
    path("health/", health_check, name="health_check"),
    path("health/live/", health_live, name="health_live"),
    path("accounts/", include("accounts.urls")),
    path("organization/", include("organization.urls")),
    path("support/", include("support.urls")),
    path("", include("patients.urls")),
    path("", include("laboratory.urls")),
    path("", include("pharmacy.urls")),
    path("", include("radiology.urls")),
    path("", include("physiotherapy.urls")),
    path("", include("eyecare.urls")),
    path("", include("consultation.urls")),
    path("", include("nursing.urls")),
    path("", include("audit.urls")),
    path("", include("notifications.urls")),
    path("", include("permissions.urls")),
    path("", include("dashboard.urls")),
    path("", include("reports.urls")),
    path("", include("analytics.urls")),
    path("", include("wards.urls")),
    path("", include("appointments.urls")),
    path("", include("common.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    # OpenAPI schema & docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    # Versioned application endpoints — canonical.
    path("api/v1/", include((api_v1_patterns, "api"), namespace="api_v1")),
    # Legacy un-versioned alias. Deprecated: responses are annotated with
    # RFC 8594 `Deprecation` / `Sunset` / `Link: rel="successor-version"`
    # headers by ``common.middleware.LegacyApiDeprecationMiddleware``.
    # Removal target: see LEGACY_API_SUNSET_DATE in settings.py.
    path("api/", include((api_v1_patterns, "api"), namespace="api_legacy")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif getattr(settings, "SERVE_MEDIA", False):
    media_prefix = (settings.MEDIA_URL or "/media/").lstrip("/")
    media_prefix = media_prefix.rstrip("/") + "/"
    urlpatterns += [
        re_path(
            rf"^{media_prefix}(?P<path>.*)$",
            static_serve,
            {"document_root": settings.MEDIA_ROOT},
        )
    ]
