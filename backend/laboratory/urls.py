"""
URL configuration for the Laboratory app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LabTemplateViewSet, LabOrderViewSet, LabTestViewSet, LabResultViewSet

router = DefaultRouter()
router.register(r'templates', LabTemplateViewSet, basename='lab-template')
router.register(r'orders', LabOrderViewSet, basename='lab-order')
router.register(r'tests', LabTestViewSet, basename='lab-test')
router.register(r'verification', LabResultViewSet, basename='lab-result')

urlpatterns = [
    path('laboratory/', include(router.urls)),
]

