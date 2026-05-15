"""
URL configuration for the Radiology app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RadiologyTemplateViewSet, RadiologyOrderViewSet, RadiologyStudyViewSet, RadiologyReportViewSet, ImagingPartnerViewSet
from .analytics_views import RadiologyAnalyticsSummaryView
from .tracker_views import RadiologyPatientTrackerView

router = DefaultRouter()
router.register(r'imaging-partners', ImagingPartnerViewSet, basename='imaging-partner')
router.register(r'templates', RadiologyTemplateViewSet, basename='radiology-template')
router.register(r'orders', RadiologyOrderViewSet, basename='radiology-order')
router.register(r'studies', RadiologyStudyViewSet, basename='radiology-study')
router.register(r'verification', RadiologyReportViewSet, basename='radiology-report')

urlpatterns = [
    path('radiology/', include(router.urls)),
    path('radiology/patient-tracker/', RadiologyPatientTrackerView.as_view(), name='radiology-patient-tracker'),
    path('radiology/analytics/summary/', RadiologyAnalyticsSummaryView.as_view(), name='radiology-analytics-summary'),
]

