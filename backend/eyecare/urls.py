"""
URL patterns for the Eye Care app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import EyeOrderViewSet, EyeSessionViewSet, EyeSessionDiagnosticFileViewSet

# Create a router and register viewsets
router = DefaultRouter()
router.register(r'orders', EyeOrderViewSet)
router.register(r'sessions', EyeSessionViewSet)
router.register(r'session-diagnostic-files', EyeSessionDiagnosticFileViewSet)

# URL patterns - include eyecare prefix like other modules
urlpatterns = [
    path(
        'eyecare/orders/checkin-from-visit/',
        EyeOrderViewSet.as_view({'post': 'checkin_from_visit'}),
        name='eye-order-checkin-from-visit',
    ),
    path('eyecare/', include(router.urls)),
]
