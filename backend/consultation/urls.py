"""
URL configuration for the Consultation app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ConsultationRoomViewSet, ConsultationSessionViewSet, ConsultationQueueViewSet, ReferralViewSet

router = DefaultRouter()
router.register(r'rooms', ConsultationRoomViewSet, basename='consultation-room')
router.register(r'sessions', ConsultationSessionViewSet, basename='consultation-session')
router.register(r'queue', ConsultationQueueViewSet, basename='consultation-queue')
router.register(r'referrals', ReferralViewSet, basename='referral')

urlpatterns = [
    path('consultation/', include(router.urls)),
]

