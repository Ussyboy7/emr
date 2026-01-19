"""
URL configuration for the Physiotherapy app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create a router and register viewsets
router = DefaultRouter()
router.register(r'templates', views.PhysioTemplateViewSet, basename='physio-template')
router.register(r'orders', views.PhysioOrderViewSet, basename='physio-order')
router.register(r'sessions', views.PhysioSessionViewSet, basename='physio-session')

# URL patterns - include physiotherapy prefix like other modules
urlpatterns = [
    path('physiotherapy/', include(router.urls)),
    path('stats/', views.PhysioStatsView.as_view(), name='physio-stats'),
]