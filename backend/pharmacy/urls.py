"""
URL configuration for the Pharmacy app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    GenericMedicationViewSet, MedicationViewSet, MedicationInventoryViewSet, PrescriptionViewSet,
    DispenseViewSet, InventoryAlertViewSet, StockRequestViewSet, StockIssueViewSet
)

router = DefaultRouter()
router.register(r'generics', GenericMedicationViewSet, basename='generic-medication')
router.register(r'medications', MedicationViewSet, basename='medication')
router.register(r'inventory', MedicationInventoryViewSet, basename='medication-inventory')
router.register(r'prescriptions', PrescriptionViewSet, basename='prescription')
router.register(r'history', DispenseViewSet, basename='dispense')
router.register(r'inventory-alerts', InventoryAlertViewSet, basename='inventory-alert')
router.register(r'stock-requests', StockRequestViewSet, basename='stock-request')
router.register(r'stock-issues', StockIssueViewSet, basename='stock-issue')

urlpatterns = [
    path('pharmacy/', include(router.urls)),
]
