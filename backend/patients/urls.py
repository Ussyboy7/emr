"""
URL configuration for the Patients app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PatientViewSet,
    VisitViewSet,
    VitalReadingViewSet,
    MedicalCertificateViewSet,
    AnnualCheckupViewSet,
)

router = DefaultRouter()
router.register(r'patients', PatientViewSet, basename='patient')
router.register(r'visits', VisitViewSet, basename='visit')
router.register(r'vitals', VitalReadingViewSet, basename='vital')
router.register(r'medical-certificates', MedicalCertificateViewSet, basename='medical-certificate')
router.register(r'annual-checkups', AnnualCheckupViewSet, basename='annual-checkup')

urlpatterns = [
    path('', include(router.urls)),
]

