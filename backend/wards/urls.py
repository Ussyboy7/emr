"""
URL configuration for the Wards app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WardViewSet, PatientAdmissionViewSet, BedViewSet, WardAssignmentViewSet

# Use manual URL patterns to avoid router conflicts
urlpatterns = [
    # Ward endpoints
    path('wards/', WardViewSet.as_view({'get': 'list', 'post': 'create'}), name='ward-list'),
    path('wards/<int:pk>/', WardViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'update', 'delete': 'destroy'}), name='ward-detail'),
    path('wards/<int:pk>/beds/', WardViewSet.as_view({'get': 'beds'}), name='ward-beds'),
    path('wards/<int:pk>/occupancy/', WardViewSet.as_view({'get': 'occupancy'}), name='ward-occupancy'),

    # Admission endpoints
    path('admissions/', PatientAdmissionViewSet.as_view({'get': 'list', 'post': 'create'}), name='admission-list'),
    path('admissions/<int:pk>/', PatientAdmissionViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'update', 'delete': 'destroy'}), name='admission-detail'),
    path('admissions/<int:pk>/initiate_discharge/', PatientAdmissionViewSet.as_view({'post': 'initiate_discharge'}), name='admission-initiate-discharge'),
    path('admissions/<int:pk>/discharge/', PatientAdmissionViewSet.as_view({'post': 'discharge'}), name='admission-discharge'),
    path('admissions/<int:pk>/transfer/', PatientAdmissionViewSet.as_view({'post': 'transfer'}), name='admission-transfer'),
    path('admissions/<int:pk>/assign_bed/', PatientAdmissionViewSet.as_view({'post': 'assign_bed'}), name='admission-assign-bed'),

    # Bed endpoints
    path('beds/', BedViewSet.as_view({'get': 'list', 'post': 'create'}), name='bed-list'),
    path('beds/<int:pk>/', BedViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'update', 'delete': 'destroy'}), name='bed-detail'),
    path('beds/<int:pk>/assign_patient/', BedViewSet.as_view({'post': 'assign_patient'}), name='bed-assign-patient'),
    path('beds/<int:pk>/discharge_patient/', BedViewSet.as_view({'post': 'discharge_patient'}), name='bed-discharge-patient'),

    # Assignment endpoints
    path('assignments/', WardAssignmentViewSet.as_view({'get': 'list', 'post': 'create'}), name='assignment-list'),
    path('assignments/<int:pk>/', WardAssignmentViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'update', 'delete': 'destroy'}), name='assignment-detail'),
    path('assignments/<int:pk>/complete/', WardAssignmentViewSet.as_view({'post': 'complete'}), name='assignment-complete'),
]