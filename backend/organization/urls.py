"""
URL configuration for the Organization app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClinicViewSet,
    DepartmentViewSet,
    RoomViewSet,
    OutpatientClinicTypeViewSet,
    WorkLocationViewSet,
    SystemConfigViewSet,
    SecuritySettingsView,
)

router = DefaultRouter()
router.register(r'clinics', ClinicViewSet, basename='clinic')
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'rooms', RoomViewSet, basename='room')
router.register(
    r'outpatient-clinic-types',
    OutpatientClinicTypeViewSet,
    basename='outpatient-clinic-type',
)
router.register(r'work-locations', WorkLocationViewSet, basename='work-location')
router.register(r'system-config', SystemConfigViewSet, basename='system-config')

urlpatterns = [
    path('security-settings/', SecuritySettingsView.as_view(), name='security-settings'),
    path('', include(router.urls)),
]
