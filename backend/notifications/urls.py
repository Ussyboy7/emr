"""
URL configuration for the Notifications app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    NotificationViewSet,
    NotificationPreferencesViewSet,
    NotificationRoutingMatrixView,
)

router = DefaultRouter()
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'preferences', NotificationPreferencesViewSet, basename='notification-preferences')

urlpatterns = [
    path(
        'notifications/routing-matrix/',
        NotificationRoutingMatrixView.as_view(),
        name='notification-routing-matrix',
    ),
    path('notifications/', include(router.urls)),
]

