"""
URL configuration for the Wards app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WardViewSet,
    PatientAdmissionViewSet,
    BedViewSet,
    WardAssignmentViewSet,
    AdmissionObservationVitalViewSet,
    AdmissionTreatmentRowViewSet,
    AdmissionEscortViewSet,
)

# Use manual URL patterns to avoid router conflicts
urlpatterns = [
    # Ward endpoints
    path('wards/', WardViewSet.as_view({'get': 'list', 'post': 'create'}), name='ward-list'),
    path('wards/<int:pk>/', WardViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'}), name='ward-detail'),
    path('wards/<int:pk>/beds/', WardViewSet.as_view({'get': 'beds'}), name='ward-beds'),
    path('wards/<int:pk>/occupancy/', WardViewSet.as_view({'get': 'occupancy'}), name='ward-occupancy'),

    # Admission endpoints
    path('admissions/list-stats/', PatientAdmissionViewSet.as_view({'get': 'list_stats'}), name='admission-list-stats'),
    path('admissions/', PatientAdmissionViewSet.as_view({'get': 'list', 'post': 'create'}), name='admission-list'),
    path('admissions/<int:pk>/', PatientAdmissionViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'}), name='admission-detail'),
    path('admissions/<int:pk>/initiate_discharge/', PatientAdmissionViewSet.as_view({'post': 'initiate_discharge'}), name='admission-initiate-discharge'),
    path('admissions/<int:pk>/cancel_referral/', PatientAdmissionViewSet.as_view({'post': 'cancel_referral'}), name='admission-cancel-referral'),
    path('admissions/<int:pk>/update_referral/', PatientAdmissionViewSet.as_view({'post': 'update_referral'}), name='admission-update-referral'),
    path('admissions/<int:pk>/discharge/', PatientAdmissionViewSet.as_view({'post': 'discharge'}), name='admission-discharge'),
    path('admissions/<int:pk>/transfer/', PatientAdmissionViewSet.as_view({'post': 'transfer'}), name='admission-transfer'),
    path('admissions/<int:pk>/assign_bed/', PatientAdmissionViewSet.as_view({'post': 'assign_bed'}), name='admission-assign-bed'),
    path('admissions/<int:pk>/summary_pdf/', PatientAdmissionViewSet.as_view({'get': 'summary_pdf'}), name='admission-summary-pdf'),
    path('admissions/<int:pk>/discharge_slip_pdf/', PatientAdmissionViewSet.as_view({'get': 'discharge_slip_pdf'}), name='admission-discharge-slip-pdf'),
    path(
        'admissions/<int:pk>/referral_letter_pdf/',
        PatientAdmissionViewSet.as_view({'get': 'referral_letter_pdf'}),
        name='admission-referral-letter-pdf',
    ),
    path(
        'admissions/<int:pk>/responsibility_form_pdf/',
        PatientAdmissionViewSet.as_view({'get': 'responsibility_form_pdf'}),
        name='admission-responsibility-form-pdf',
    ),

    # Bed endpoints
    path('beds/', BedViewSet.as_view({'get': 'list', 'post': 'create'}), name='bed-list'),
    path('beds/<int:pk>/', BedViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'}), name='bed-detail'),
    path('beds/<int:pk>/assign_patient/', BedViewSet.as_view({'post': 'assign_patient'}), name='bed-assign-patient'),
    path('beds/<int:pk>/discharge_patient/', BedViewSet.as_view({'post': 'discharge_patient'}), name='bed-discharge-patient'),

    # Assignment endpoints
    path(
        'assignments/active-for-admissions/',
        WardAssignmentViewSet.as_view({'get': 'active_for_admissions'}),
        name='assignment-active-for-admissions',
    ),
    path('assignments/', WardAssignmentViewSet.as_view({'get': 'list', 'post': 'create'}), name='assignment-list'),
    path('assignments/<int:pk>/', WardAssignmentViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'}), name='assignment-detail'),
    path('assignments/<int:pk>/complete/', WardAssignmentViewSet.as_view({'post': 'complete'}), name='assignment-complete'),

    path(
        'observation-vitals/',
        AdmissionObservationVitalViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='observation-vital-list',
    ),
    path(
        'observation-vitals/<int:pk>/',
        AdmissionObservationVitalViewSet.as_view({
            'get': 'retrieve',
            'put': 'update',
            'patch': 'partial_update',
            'delete': 'destroy',
        }),
        name='observation-vital-detail',
    ),
    path(
        'treatment-sheet-rows/',
        AdmissionTreatmentRowViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='treatment-sheet-row-list',
    ),
    path(
        'treatment-sheet-rows/<int:pk>/',
        AdmissionTreatmentRowViewSet.as_view({
            'get': 'retrieve',
            'put': 'update',
            'patch': 'partial_update',
            'delete': 'destroy',
        }),
        name='treatment-sheet-row-detail',
    ),

    # Admission escorts (patients accompanied to an external facility).
    path(
        'admission-escorts/',
        AdmissionEscortViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='admission-escort-list',
    ),
    path(
        'admission-escorts/<int:pk>/',
        AdmissionEscortViewSet.as_view({
            'get': 'retrieve',
            'put': 'update',
            'patch': 'partial_update',
            'delete': 'destroy',
        }),
        name='admission-escort-detail',
    ),
    path(
        'admission-escorts/<int:pk>/confirm_arrival/',
        AdmissionEscortViewSet.as_view({'post': 'confirm_arrival'}),
        name='admission-escort-confirm-arrival',
    ),
]