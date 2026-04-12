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

urlpatterns = [
    path('', include(router.urls)),
]
