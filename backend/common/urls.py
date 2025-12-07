"""
URL configuration for the Common app.
"""
from django.urls import path
from .views import FileUploadView, SendEmailView, ExportDataView, health_check

urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('common/upload/', FileUploadView.as_view(), name='file-upload'),
    path('common/send-email/', SendEmailView.as_view(), name='send-email'),
    path('common/export/', ExportDataView.as_view(), name='export-data'),
]

