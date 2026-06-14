from django.urls import path
from .views import ClientLogsView

app_name = "support"

urlpatterns = [
    path("client-logs/", ClientLogsView.as_view(), name="client_logs"),
]
