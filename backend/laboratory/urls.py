"""
URL configuration for the Laboratory app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LabPartnerViewSet,
    LabTemplateViewSet,
    LabOrderViewSet,
    LabTestViewSet,
    LabResultViewSet,
)
from .analytics_views import LaboratoryAnalyticsSummaryView
from .tracker_views import LaboratoryPatientTrackerView

router = DefaultRouter()
router.register(r'lab-partners', LabPartnerViewSet, basename='lab-partner')
router.register(r'templates', LabTemplateViewSet, basename='lab-template')
router.register(r'orders', LabOrderViewSet, basename='lab-order')
router.register(r'tests', LabTestViewSet, basename='lab-test')
router.register(r'verification', LabResultViewSet, basename='lab-result')

urlpatterns = [
    path('laboratory/', include(router.urls)),
    path('laboratory/analytics/summary/', LaboratoryAnalyticsSummaryView.as_view(), name='laboratory-analytics-summary'),
    path('laboratory/patient-tracker/', LaboratoryPatientTrackerView.as_view(), name='laboratory-patient-tracker'),
]

