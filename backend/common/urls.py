"""
URL configuration for the Common app.
"""
from django.urls import path
from .views import (
    FileUploadView,
    SendEmailView,
    ExportDataView,
    health_check,
    server_time,
    SystemMetricsView,
    LiveDashboardView,
)

urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('common/server-time/', server_time, name='server-time'),
    path('common/metrics/', SystemMetricsView.as_view(), name='system-metrics'),
    # Lightweight payload for the admin dashboard auto-poll (online
    # users count + live system health). Designed to be cheap enough
    # to call every 30 s without dragging in users/roles/audit fetches.
    path('common/dashboard/live/', LiveDashboardView.as_view(), name='dashboard-live'),
    path('common/upload/', FileUploadView.as_view(), name='file-upload'),
    path('common/send-email/', SendEmailView.as_view(), name='send-email'),
    path('common/export/', ExportDataView.as_view(), name='export-data'),
]

