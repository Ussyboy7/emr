from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from consultation.models import ConsultationQueue, ConsultationSession
from nursing.models import NursingOrder
from patients.models import Visit


@transaction.atomic
def finalize_consultation_artifacts_for_visit(
    visit: Visit,
    *,
    session_terminal_status: str,
    now=None,
) -> dict:
    """
    Align ConsultationQueue and ConsultationSession rows when a visit is no longer in-flight.

    session_terminal_status: 'completed' (normal completion) or 'cancelled' (workflow close / not seen).

    Does not change Visit.status — callers must already have saved the visit to a terminal status.
    """
    if session_terminal_status not in {"completed", "cancelled"}:
        raise ValueError("session_terminal_status must be 'completed' or 'cancelled'")
    now = now or timezone.now()
    changed = {"queue_items_deactivated": 0, "sessions_updated": 0}

    q_qs = ConsultationQueue.objects.filter(visit=visit, is_active=True)
    changed["queue_items_deactivated"] = q_qs.update(is_active=False, called_at=now)

    for session in ConsultationSession.objects.filter(visit=visit, status__in=["active", "paused"]).iterator():
        session.status = session_terminal_status
        if not session.ended_at:
            session.ended_at = now
        session.save(update_fields=["status", "ended_at"])
        changed["sessions_updated"] += 1

    return changed


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

    fin = finalize_consultation_artifacts_for_visit(visit, session_terminal_status="cancelled", now=now)
    changed["queue_items_deactivated"] = fin["queue_items_deactivated"]
    changed["sessions_cancelled"] = fin["sessions_updated"]

    n_qs = NursingOrder.objects.filter(visit=visit, status__in=["pending", "in_progress"])
    changed["nursing_orders_cancelled"] = n_qs.update(status="cancelled")

    return changed
