"""
URL configuration for the Pharmacy app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MedicationViewSet, MedicationInventoryViewSet, PrescriptionViewSet,
    DispenseViewSet, InventoryAlertViewSet
)

router = DefaultRouter()
router.register(r'medications', MedicationViewSet, basename='medication')
router.register(r'inventory', MedicationInventoryViewSet, basename='medication-inventory')
router.register(r'prescriptions', PrescriptionViewSet, basename='prescription')
router.register(r'history', DispenseViewSet, basename='dispense')
router.register(r'inventory-alerts', InventoryAlertViewSet, basename='inventory-alert')

urlpatterns = [
    path('pharmacy/', include(router.urls)),
]

