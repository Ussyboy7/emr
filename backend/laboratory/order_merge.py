"""Append new lab tests into an existing fully-pending same-visit order."""

from __future__ import annotations

PRIORITY_RANK = {"routine": 0, "urgent": 1, "stat": 2}


def lab_order_is_fully_pending(order) -> bool:
    """True when every line is still untouched (safe to append)."""
    if getattr(order, "lab_number", None):
        return False
    if getattr(order, "source_type", None) == "external_manual":
        return False
    tests = list(order.tests.all())
    if not tests:
        return True
    for t in tests:
        if t.status != "pending":
            return False
        if getattr(t, "routing_status", "pending_triage") not in (
            "pending_triage",
            "",
            None,
        ):
            return False
        if getattr(t, "sample_batch_id", None):
            return False
    return True


def find_mergeable_lab_order(
    *,
    patient_id,
    visit_id=None,
    consultation_session_id=None,
    admission_id=None,
):
    from laboratory.models import LabOrder

    qs = LabOrder.objects.filter(patient_id=patient_id).exclude(
        source_type="external_manual"
    )
    if visit_id:
        qs = qs.filter(visit_id=visit_id)
    elif admission_id:
        qs = qs.filter(admission_id=admission_id)
    else:
        return None

    candidates = list(qs.prefetch_related("tests").order_by("-ordered_at", "-id")[:30])
    pending = [o for o in candidates if lab_order_is_fully_pending(o)]
    if not pending:
        return None

    if consultation_session_id:
        session_match = next(
            (
                o
                for o in pending
                if o.consultation_session_id == consultation_session_id
            ),
            None,
        )
        if session_match:
            return session_match
    return pending[0]


def bump_priority(current: str, incoming: str | None) -> str:
    cur = current or "routine"
    nxt = incoming or "routine"
    if PRIORITY_RANK.get(nxt, 0) > PRIORITY_RANK.get(cur, 0):
        return nxt
    return cur
