"""
URL configuration for the Appointments app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AppointmentViewSet, AppointmentSlotViewSet

router = DefaultRouter()
router.register(r'appointments', AppointmentViewSet, basename='appointment')
router.register(r'slots', AppointmentSlotViewSet, basename='appointment-slot')

urlpatterns = [
    path('appointments/', include(router.urls)),
]

