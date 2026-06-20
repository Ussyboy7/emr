from django.urls import path

from .views import (
    ClientLogsView,
    SupportTicketDetailView,
    SupportTicketQueueView,
    SupportTicketView,
    UserDocDetailView,
    UserDocsListView,
)

app_name = "support"

urlpatterns = [
    path("client-logs/", ClientLogsView.as_view(), name="client_logs"),
    path("tickets/", SupportTicketView.as_view(), name="support_tickets"),
    path("tickets/queue/", SupportTicketQueueView.as_view(), name="support_ticket_queue"),
    path("tickets/<int:pk>/", SupportTicketDetailView.as_view(), name="support_ticket_detail"),
    path("docs/", UserDocsListView.as_view(), name="user_docs"),
    path("docs/<slug:slug>/", UserDocDetailView.as_view(), name="user_doc_detail"),
]
