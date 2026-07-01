"""
URL configuration for the Consultation app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ConsultationRoomViewSet,
    ConsultationSessionViewSet,
    ConsultationQueueViewSet,
    ReferralViewSet,
    ReferralFacilityViewSet,
    ICD10CodeViewSet,
    DiagnosisViewSet,
    PresentingComplaintCategoryViewSet,
    PresentingComplaintViewSet,
)

router = DefaultRouter()
router.register(r'rooms', ConsultationRoomViewSet, basename='consultation-room')
router.register(r'sessions', ConsultationSessionViewSet, basename='consultation-session')
router.register(r'queue', ConsultationQueueViewSet, basename='consultation-queue')
router.register(r'referrals', ReferralViewSet, basename='referral')
router.register(r'referral-facilities', ReferralFacilityViewSet, basename='referral-facility')
router.register(r'icd10-codes', ICD10CodeViewSet, basename='icd10-code')
router.register(r'diagnoses', DiagnosisViewSet, basename='diagnosis')
router.register(r'presenting-complaint-categories', PresentingComplaintCategoryViewSet, basename='presenting-complaint-category')
router.register(r'presenting-complaints', PresentingComplaintViewSet, basename='presenting-complaint')

# Explicit referral stamp route (registered before the router so it always resolves; avoids 404 if router
# action registration is missing on older deployed images).
referral_ack_form = ReferralViewSet.as_view({"post": "acknowledge_responsibility_form"})

# Room presence actions — explicit routes so check-in/out survive stale router registration on deploy.
room_check_in = ConsultationRoomViewSet.as_view({"post": "check_in"})
room_check_out = ConsultationRoomViewSet.as_view({"post": "check_out"})
room_set_accepting = ConsultationRoomViewSet.as_view({"post": "set_accepting"})
room_heartbeat = ConsultationRoomViewSet.as_view({"post": "heartbeat"})

urlpatterns = [
    path(
        "consultation/referrals/<int:pk>/acknowledge_responsibility_form/",
        referral_ack_form,
        name="referral-acknowledge-responsibility-form",
    ),
    path(
        "consultation/rooms/<int:pk>/check-in/",
        room_check_in,
        name="consultation-room-check-in",
    ),
    path(
        "consultation/rooms/<int:pk>/check-out/",
        room_check_out,
        name="consultation-room-check-out",
    ),
    path(
        "consultation/rooms/<int:pk>/set-accepting/",
        room_set_accepting,
        name="consultation-room-set-accepting",
    ),
    path(
        "consultation/rooms/<int:pk>/heartbeat/",
        room_heartbeat,
        name="consultation-room-heartbeat",
    ),
    path("consultation/", include(router.urls)),
]
