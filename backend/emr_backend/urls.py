"""Root URL configuration for the EMR backend."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from common.views import health_check


api_v1_patterns = [
    path('health/', health_check, name='health_check'),
    path('accounts/', include('accounts.urls')),
    path('organization/', include('organization.urls')),
    path('', include('patients.urls')),
    path('', include('laboratory.urls')),
    path('', include('pharmacy.urls')),
    path('', include('radiology.urls')),
    path('', include('consultation.urls')),
    path('', include('nursing.urls')),
    path('', include('audit.urls')),
    path('', include('notifications.urls')),
    path('', include('permissions.urls')),
    path('', include('dashboard.urls')),
    path('', include('reports.urls')),
    path('', include('appointments.urls')),
    path('', include('common.urls')),
]

urlpatterns = [
    path('admin/', admin.site.urls),

    # OpenAPI schema & docs
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # Versioned application endpoints
    path('api/v1/', include((api_v1_patterns, 'api'), namespace='api_v1')),

    # Legacy alias
    path('api/', include((api_v1_patterns, 'api'), namespace='api_legacy')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

