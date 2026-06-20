import json
import logging
import uuid

from django.conf import settings
from django.core.paginator import Paginator
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, views
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from audit.models import ActivityLog
from audit.services import AuditService
from common.openapi import JSON_MUTATION_RESPONSES, document_api_view
from common.services import EmailService
from permissions.drf_permissions import ApiPageAccessPermission

from .serializers import SupportTicketSerializer, SupportTicketStatusSerializer
from .ticket_utils import (
    SUPPORT_TICKET_MODULE,
    SUPPORT_TICKET_OBJECT_TYPE,
    serialize_ticket,
    ticket_status,
    tickets_queryset,
)
from .user_docs import list_user_docs, read_user_doc

logger = logging.getLogger(__name__)


def _paginate_queryset(queryset, request):
    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(100, max(1, int(request.query_params.get("page_size", 20))))
    except (TypeError, ValueError):
        page_size = 20
    paginator = Paginator(queryset, page_size)
    page_obj = paginator.get_page(page)
    return page_obj, paginator.count


IT_TICKET_PAGES = ("/admin/support-tickets", "/admin/audit", "/admin")


@document_api_view(
    tag="Common",
    summary="Receive client-side debug logs",
    methods=("post",),
    responses=JSON_MUTATION_RESPONSES,
)
class ClientLogsView(views.APIView):
    """Endpoint to receive client-side logs from the frontend."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            data = request.data if isinstance(request.data, dict) else json.loads(request.body)
            level = data.get("level", "info")
            message = data.get("message", "")
            context = data.get("context", {})

            log_message = f"CLIENT-{level.upper()}: {message}"
            if context:
                log_message += f" | Context: {context}"

            if level.lower() == "error":
                logger.error(log_message)
            elif level.lower() == "warn":
                logger.warning(log_message)
            else:
                logger.info(log_message)

            return Response({"status": "logged"})

        except json.JSONDecodeError:
            logger.warning("CLIENT-LOG: Invalid JSON received")
            return Response({"error": "Invalid JSON"}, status=400)
        except Exception as e:
            logger.error(f"CLIENT-LOG: Error processing log: {str(e)}")
            return Response({"error": "Internal server error"}, status=500)


@document_api_view(
    tag="Common",
    summary="Submit or list help-desk support tickets",
    methods=("get", "post"),
    responses=JSON_MUTATION_RESPONSES,
)
class SupportTicketView(views.APIView):
    """Create support tickets or list the current user's submissions."""

    permission_classes = [IsAuthenticated, ApiPageAccessPermission]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "support_ticket"

    def get_throttles(self):
        if self.request.method == "POST":
            return [ScopedRateThrottle()]
        return []

    def get(self, request):
        status_filter = request.query_params.get("status")
        qs = tickets_queryset(user=request.user, status=status_filter)
        page_obj, count = _paginate_queryset(qs, request)
        return Response(
            {
                "count": count,
                "results": [serialize_ticket(log) for log in page_obj.object_list],
            }
        )

    def post(self, request):
        serializer = SupportTicketSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        reference = f"EMR-{timezone.now().year}-{uuid.uuid4().hex[:6].upper()}"

        log = AuditService.log_activity(
            user=request.user,
            action="create",
            object_type=SUPPORT_TICKET_OBJECT_TYPE,
            object_id=reference,
            module=SUPPORT_TICKET_MODULE,
            object_repr=data["subject"],
            description=data["description"],
            metadata={
                "reference": reference,
                "category": data["category"],
                "priority": data["priority"],
                "subject": data["subject"],
                "status": "open",
            },
            request=request,
        )

        logger.info(
            "Support ticket %s submitted by %s (%s)",
            reference,
            request.user,
            data["category"],
        )

        notify_to = getattr(settings, "EMR_SUPPORT_EMAIL", "") or ""
        if notify_to:
            user_label = request.user.get_full_name() or request.user.username
            try:
                EmailService.send_email(
                    notify_to,
                    f"[EMR Support] {reference} — {data['subject']}",
                    (
                        f"Reference: {reference}\n"
                        f"From: {user_label} ({request.user.username})\n"
                        f"Category: {data['category']}\n"
                        f"Priority: {data['priority']}\n\n"
                        f"{data['description']}\n\n"
                        f"View in Administration → Support Tickets or Audit (object type: support_ticket)."
                    ),
                )
            except Exception:
                logger.exception("Support ticket email notification failed for %s", reference)

        ticket = serialize_ticket(log)
        return Response(ticket, status=status.HTTP_201_CREATED)


@document_api_view(
    tag="Common",
    summary="IT support ticket queue",
    methods=("get",),
    responses=JSON_MUTATION_RESPONSES,
)
class SupportTicketQueueView(views.APIView):
    """Org-wide support ticket queue for IT staff."""

    permission_classes = [IsAuthenticated, ApiPageAccessPermission]
    required_pages = IT_TICKET_PAGES

    def get(self, request):
        status_filter = request.query_params.get("status")
        qs = tickets_queryset(status=status_filter)
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(object_repr__icontains=search)
                | Q(object_id__icontains=search)
                | Q(description__icontains=search)
            )
        page_obj, count = _paginate_queryset(qs, request)
        return Response(
            {
                "count": count,
                "results": [serialize_ticket(log, include_user=True) for log in page_obj.object_list],
            }
        )


@document_api_view(
    tag="Common",
    summary="Update support ticket status",
    methods=("patch",),
    responses=JSON_MUTATION_RESPONSES,
)
class SupportTicketDetailView(views.APIView):
    """Update workflow status on a support ticket."""

    permission_classes = [IsAuthenticated, ApiPageAccessPermission]
    required_pages = IT_TICKET_PAGES

    def patch(self, request, pk: int):
        try:
            log = ActivityLog.objects.select_related("user").get(
                pk=pk,
                object_type=SUPPORT_TICKET_OBJECT_TYPE,
                module=SUPPORT_TICKET_MODULE,
                action="create",
            )
        except ActivityLog.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SupportTicketStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]
        old_status = ticket_status(log)
        if new_status == old_status:
            return Response(serialize_ticket(log, include_user=True))

        meta = dict(log.metadata or {})
        meta["status"] = new_status
        log.metadata = meta
        log.save(update_fields=["metadata"])

        reference = meta.get("reference") or log.object_id
        AuditService.log_activity(
            user=request.user,
            action="update",
            object_type=SUPPORT_TICKET_OBJECT_TYPE,
            object_id=reference,
            module=SUPPORT_TICKET_MODULE,
            object_repr=log.object_repr,
            description=f"Status changed from {old_status} to {new_status}",
            metadata={"reference": reference, "status": new_status},
            old_values={"status": old_status},
            new_values={"status": new_status},
            request=request,
        )

        return Response(serialize_ticket(log, include_user=True))


@document_api_view(
    tag="Common",
    summary="List in-app user guides",
    methods=("get",),
    responses=JSON_MUTATION_RESPONSES,
)
class UserDocsListView(views.APIView):
    permission_classes = [IsAuthenticated, ApiPageAccessPermission]

    def get(self, request):
        return Response({"results": list_user_docs()})


@document_api_view(
    tag="Common",
    summary="Read an in-app user guide",
    methods=("get",),
    responses=JSON_MUTATION_RESPONSES,
)
class UserDocDetailView(views.APIView):
    permission_classes = [IsAuthenticated, ApiPageAccessPermission]

    def get(self, request, slug: str):
        doc = read_user_doc(slug)
        if not doc:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(doc)
