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

# Explicit referral stamp route (registered before the router so it always resolves; avoids 404 if router
# action registration is missing on older deployed images).
referral_ack_form = ReferralViewSet.as_view({"post": "acknowledge_responsibility_form"})

urlpatterns = [
    path(
        "consultation/referrals/<int:pk>/acknowledge_responsibility_form/",
        referral_ack_form,
        name="referral-acknowledge-responsibility-form",
    ),
    path("consultation/", include(router.urls)),
]

