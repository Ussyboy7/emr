from django.urls import path
from . import views

app_name = "support"

urlpatterns = [
    path("client-logs/", views.client_logs, name="client_logs"),
]
