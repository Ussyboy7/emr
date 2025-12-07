"""
URL configuration for the Radiology app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RadiologyOrderViewSet, RadiologyReportViewSet

router = DefaultRouter()
router.register(r'orders', RadiologyOrderViewSet, basename='radiology-order')
router.register(r'verification', RadiologyReportViewSet, basename='radiology-report')

urlpatterns = [
    path('radiology/', include(router.urls)),
]

