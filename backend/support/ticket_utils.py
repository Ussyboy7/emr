"""Support ticket helpers — tickets are stored as ActivityLog rows."""
from __future__ import annotations

from audit.models import ActivityLog

SUPPORT_TICKET_OBJECT_TYPE = "support_ticket"
SUPPORT_TICKET_MODULE = "support"
SUPPORT_TICKET_STATUSES = ("open", "in_progress", "resolved", "closed")


def ticket_status(log: ActivityLog) -> str:
    meta = log.metadata if isinstance(log.metadata, dict) else {}
    status = meta.get("status") or "open"
    return status if status in SUPPORT_TICKET_STATUSES else "open"


def serialize_ticket(log: ActivityLog, *, include_user: bool = False) -> dict:
    meta = log.metadata if isinstance(log.metadata, dict) else {}
    payload = {
        "id": log.id,
        "reference": meta.get("reference") or log.object_id,
        "category": meta.get("category", ""),
        "priority": meta.get("priority", "medium"),
        "subject": meta.get("subject") or log.object_repr or "",
        "description": log.description or "",
        "status": ticket_status(log),
        "created_at": log.created_at.isoformat(),
    }
    if include_user:
        payload["user_id"] = log.user_id
        payload["user_name"] = (log.user.get_full_name() or log.user.username) if log.user else ""
        payload["user_username"] = log.user.username if log.user else ""
    return payload


def tickets_queryset(*, user=None, status: str | None = None):
    qs = ActivityLog.objects.filter(
        object_type=SUPPORT_TICKET_OBJECT_TYPE,
        module=SUPPORT_TICKET_MODULE,
        action="create",
    ).select_related("user")
    if user is not None:
        qs = qs.filter(user=user)
    if status and status in SUPPORT_TICKET_STATUSES:
        qs = qs.filter(metadata__status=status)
    return qs.order_by("-created_at")
