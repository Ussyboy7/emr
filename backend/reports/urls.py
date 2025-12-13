"""
URL configuration for the Reports app.
"""
from django.urls import path
from .views import (
    PatientDemographicsReportView,
    LabStatisticsReportView,
    TopDiagnosesReportView,
    LabPerformanceReportView,
    PharmacyPerformanceReportView,
    ExportDataView,
    AttendanceSummaryReportView,
    DispensedPrescriptionsReportView,
    LaboratoryAttendanceReportView,
    ServicesActivitiesReportView,
    ComprehensiveReportView,
    ClinicAttendanceReportView,
    RadiologicalServicesReportView,
    ReferralTrackingReportView,
    DiseasePatternReportView,
    GOPAttendanceReportView,
    WeekendCallDutyReportView,
)

urlpatterns = [
    path('reports/patient-demographics/', PatientDemographicsReportView.as_view(), name='patient-demographics-report'),
    path('reports/lab-statistics/', LabStatisticsReportView.as_view(), name='lab-statistics-report'),
    path('reports/top-diagnoses/', TopDiagnosesReportView.as_view(), name='top-diagnoses-report'),
    path('reports/lab-performance/', LabPerformanceReportView.as_view(), name='lab-performance-report'),
    path('reports/pharmacy-performance/', PharmacyPerformanceReportView.as_view(), name='pharmacy-performance-report'),
    path('reports/export/', ExportDataView.as_view(), name='export-data'),
    path('reports/attendance-summary/', AttendanceSummaryReportView.as_view(), name='attendance-summary-report'),
    path('reports/dispensed-prescriptions/', DispensedPrescriptionsReportView.as_view(), name='dispensed-prescriptions-report'),
    path('reports/laboratory-attendance/', LaboratoryAttendanceReportView.as_view(), name='laboratory-attendance-report'),
    path('reports/services-activities/', ServicesActivitiesReportView.as_view(), name='services-activities-report'),
    path('reports/comprehensive/', ComprehensiveReportView.as_view(), name='comprehensive-report'),
    path('reports/clinic-attendance/', ClinicAttendanceReportView.as_view(), name='clinic-attendance-report'),
    path('reports/radiological-services/', RadiologicalServicesReportView.as_view(), name='radiological-services-report'),
    path('reports/referral-tracking/', ReferralTrackingReportView.as_view(), name='referral-tracking-report'),
    path('reports/disease-pattern/', DiseasePatternReportView.as_view(), name='disease-pattern-report'),
    path('reports/gop-attendance/', GOPAttendanceReportView.as_view(), name='gop-attendance-report'),
    path('reports/weekend-duty/', WeekendCallDutyReportView.as_view(), name='weekend-duty-report'),
]

