"""Shared visit updates when a consultation session completes."""
from __future__ import annotations

from patients.nursing_leg_status import (
    apply_visit_completion_after_leg,
    mark_consultation_session_clinic_completed,
)


def finalize_consultation_session_for_visit(session, *, user) -> bool:
    """
    After a consultation session ends:
    - mark the consultation clinic leg complete on the visit
    - ensure a PhysioOrder exists when the visit includes Physiotherapy
    - reopen the visit if it was incorrectly closed while physio remains
    - close the visit only when every clinic leg is done

    Returns True if visit.status transitioned to completed.
    """
    visit = getattr(session, "visit", None)
    if visit is None:
        return False

    mark_consultation_session_clinic_completed(visit, session)

    from physiotherapy.visit_orders import (
        ensure_physio_order_for_visit,
        reopen_visit_if_physio_leg_open,
    )

    ensure_physio_order_for_visit(
        visit,
        ordered_by=user,
        referral_source="consultation_end",
    )
    reopen_visit_if_physio_leg_open(visit)

    return apply_visit_completion_after_leg(visit)
