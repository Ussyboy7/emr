"""Single-request workspace payload for an active consultation session."""

from __future__ import annotations

from consultation.models import ConsultationSession

from patients.workspace_bundle import build_workspace_bundle


def build_session_workspace_bundle(session: ConsultationSession, *, vitals_limit: int = 10) -> dict:
    return build_workspace_bundle(
        diagnosis_filter={"session_id": session.id},
        order_filter={"consultation_session_id": session.id},
        patient_id=session.patient_id,
        vitals_visit_id=session.visit_id,
        vitals_limit=vitals_limit,
    )
