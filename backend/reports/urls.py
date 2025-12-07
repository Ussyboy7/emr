"""
URL configuration for the Reports app.
"""
from django.urls import path
from .views import PatientDemographicsReportView, LabStatisticsReportView, ExportDataView

urlpatterns = [
    path('reports/patient-demographics/', PatientDemographicsReportView.as_view(), name='patient-demographics-report'),
    path('reports/lab-statistics/', LabStatisticsReportView.as_view(), name='lab-statistics-report'),
    path('reports/export/', ExportDataView.as_view(), name='export-data'),
]

