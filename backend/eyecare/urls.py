"""
URL configuration for the Eyecare app.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EyecareAnalyticsSummaryView
from .tracker_views import EyecarePatientTrackerView
from .viewsets import EyeOrderViewSet, EyeSessionDiagnosticFileViewSet, EyeSessionViewSet

router = DefaultRouter()
router.register(r"orders", EyeOrderViewSet, basename="eye-order")
router.register(r"sessions", EyeSessionViewSet, basename="eye-session")
router.register(
    r"session-diagnostic-files",
    EyeSessionDiagnosticFileViewSet,
    basename="eye-session-diagnostic-file",
)

urlpatterns = [
    path("eyecare/patient-tracker/", EyecarePatientTrackerView.as_view(), name="eyecare-patient-tracker"),
    path("eyecare/analytics/summary/", EyecareAnalyticsSummaryView.as_view(), name="eyecare-analytics-summary"),
    path("eyecare/", include(router.urls)),
]
