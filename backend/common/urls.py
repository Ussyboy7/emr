"""
URL configuration for the Common app.
"""
from django.urls import path
from .views import (
    FileUploadView,
    ProtectedMediaView,
    SendEmailView,
    ExportDataView,
    HealthCheckView,
    ServerTimeView,
    SystemMetricsView,
    OperationalDashboardView,
    AdminDashboardStatsView,
    LiveDashboardView,
    OnlineUsersView,
)

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('common/server-time/', ServerTimeView.as_view(), name='server-time'),
    path('common/metrics/', SystemMetricsView.as_view(), name='system-metrics'),
    # Lightweight payload for the admin dashboard auto-poll (online
    # users count + live system health). Designed to be cheap enough
    # to call every 30 s without dragging in users/roles/audit fetches.
    path('common/dashboard/operational/', OperationalDashboardView.as_view(), name='dashboard-operational'),
    path('common/dashboard/admin/', AdminDashboardStatsView.as_view(), name='dashboard-admin'),
    path('common/dashboard/live/', LiveDashboardView.as_view(), name='dashboard-live'),
    path('common/online-users/', OnlineUsersView.as_view(), name='online-users'),
    path('common/upload/', FileUploadView.as_view(), name='file-upload'),
    path('common/media/<path:relative_path>', ProtectedMediaView.as_view(), name='protected-media'),
    path('common/send-email/', SendEmailView.as_view(), name='send-email'),
    path('common/export/', ExportDataView.as_view(), name='export-data'),
]

