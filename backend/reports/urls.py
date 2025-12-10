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
    ExportDataView
)

urlpatterns = [
    path('reports/patient-demographics/', PatientDemographicsReportView.as_view(), name='patient-demographics-report'),
    path('reports/lab-statistics/', LabStatisticsReportView.as_view(), name='lab-statistics-report'),
    path('reports/top-diagnoses/', TopDiagnosesReportView.as_view(), name='top-diagnoses-report'),
    path('reports/lab-performance/', LabPerformanceReportView.as_view(), name='lab-performance-report'),
    path('reports/pharmacy-performance/', PharmacyPerformanceReportView.as_view(), name='pharmacy-performance-report'),
    path('reports/export/', ExportDataView.as_view(), name='export-data'),
]

