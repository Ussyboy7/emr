from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AnnualCheckupExemptionViewSet, HRComplianceViewSet

router = DefaultRouter()
router.register(r"compliance", HRComplianceViewSet, basename="hr-compliance")
router.register(r"exemptions", AnnualCheckupExemptionViewSet, basename="hr-exemption")

urlpatterns = [
    path("", include(router.urls)),
]
