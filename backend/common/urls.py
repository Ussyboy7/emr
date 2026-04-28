"""
URL configuration for the Common app.
"""
from django.urls import path
from .views import FileUploadView, SendEmailView, ExportDataView, health_check, server_time, SystemMetricsView

urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('common/server-time/', server_time, name='server-time'),
    path('common/metrics/', SystemMetricsView.as_view(), name='system-metrics'),
    path('common/upload/', FileUploadView.as_view(), name='file-upload'),
    path('common/send-email/', SendEmailView.as_view(), name='send-email'),
    path('common/export/', ExportDataView.as_view(), name='export-data'),
]

