"""Single-request workspace payload for a visit (no consultation session required)."""

from __future__ import annotations

from patients.models import Visit
from patients.workspace_bundle import build_workspace_bundle


def build_visit_workspace_bundle(visit: Visit, *, vitals_limit: int = 10) -> dict:
    return build_workspace_bundle(
        diagnosis_filter={"visit_id": visit.id},
        order_filter={"visit_id": visit.id},
        patient_id=visit.patient_id,
        vitals_visit_id=visit.id,
        vitals_limit=vitals_limit,
    )
