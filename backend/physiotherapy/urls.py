"""
URL configuration for the Physiotherapy app.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PhysiotherapyAnalyticsSummaryView, PhysiotherapyStatsView
from .tracker_views import PhysiotherapyPatientTrackerView
from .viewsets import PhysioOrderViewSet, PhysioSessionViewSet, PhysioTemplateViewSet


router = DefaultRouter()
router.register(r"templates", PhysioTemplateViewSet, basename="physio-template")
router.register(r"orders", PhysioOrderViewSet, basename="physio-order")
router.register(r"sessions", PhysioSessionViewSet, basename="physio-session")

urlpatterns = [
    path('patient-tracker/', PhysiotherapyPatientTrackerView.as_view(), name='physiotherapy-patient-tracker'),
    path('analytics/summary/', PhysiotherapyAnalyticsSummaryView.as_view(), name='physiotherapy-analytics-summary'),
    path('stats/', PhysiotherapyStatsView.as_view(), name='physiotherapy-stats'),
    path("", include(router.urls)),
]