"""
URL configuration for the Consultation app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ConsultationRoomViewSet, ConsultationSessionViewSet, ConsultationQueueViewSet, ReferralViewSet, ICD10CodeViewSet, DiagnosisViewSet

router = DefaultRouter()
router.register(r'rooms', ConsultationRoomViewSet, basename='consultation-room')
router.register(r'sessions', ConsultationSessionViewSet, basename='consultation-session')
router.register(r'queue', ConsultationQueueViewSet, basename='consultation-queue')
router.register(r'referrals', ReferralViewSet, basename='referral')
router.register(r'icd10-codes', ICD10CodeViewSet, basename='icd10-code')
router.register(r'diagnoses', DiagnosisViewSet, basename='diagnosis')

urlpatterns = [
    path('consultation/', include(router.urls)),
]

