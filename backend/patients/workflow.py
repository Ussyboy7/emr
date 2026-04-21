from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from consultation.models import ConsultationQueue, ConsultationSession
from nursing.models import NursingOrder
from patients.models import Visit


@transaction.atomic
def close_visit_workflow(
    *,
    visit: Visit,
    actor,
    reason: str = "",
    source_stage: str = "unknown",
) -> dict:
    """
    Canonically close an in-flight visit and deactivate related workflow rows.
    """
    now = timezone.now()
    changed = {
        "visit_cancelled": False,
        "queue_items_deactivated": 0,
        "sessions_cancelled": 0,
        "nursing_orders_cancelled": 0,
    }

    if visit.status != "cancelled":
        note_line = f"[Workflow Close] stage={source_stage}; reason={reason or 'not provided'}"
        existing_notes = (visit.clinical_notes or "").strip()
        visit.clinical_notes = f"{existing_notes}\n{note_line}".strip() if existing_notes else note_line
        visit.status = "cancelled"
        visit.save(update_fields=["status", "clinical_notes", "updated_at"])
        changed["visit_cancelled"] = True

    q_qs = ConsultationQueue.objects.filter(visit=visit, is_active=True)
    changed["queue_items_deactivated"] = q_qs.update(is_active=False, called_at=now)

    s_qs = ConsultationSession.objects.filter(visit=visit, status__in=["active", "paused"])
    for session in s_qs:
        session.status = "cancelled"
        if not session.ended_at:
            session.ended_at = now
        session.save(update_fields=["status", "ended_at"])
        changed["sessions_cancelled"] += 1

    n_qs = NursingOrder.objects.filter(visit=visit, status__in=["pending", "in_progress"])
    changed["nursing_orders_cancelled"] = n_qs.update(status="cancelled")

    return changed
