"""Physiotherapy clinical diagnosis — ICD-10 code frequency from completed sessions."""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from common.diagnosis_resolution import resolve_order_diagnoses
from physiotherapy.models import PhysioSession
from reports.icd_diagnosis_aggregation import build_icd_frequency_rows, increment_icd_counts


def build_physio_clinical_diagnosis_report(
    period_start: date,
    period_end: date,
    *,
    org_facility_id: int | None = None,
) -> dict:
    from common.report_period import filter_inclusive_date_range

    sessions = filter_inclusive_date_range(
        PhysioSession.objects.filter(
            status="completed",
            order__patient__isnull=False,
        ),
        "completed_at",
        period_start,
        period_end,
    ).select_related("order", "order__patient", "order__consultation_session").order_by("completed_at")
    if org_facility_id is not None:
        sessions = sessions.filter(order__location_clinic_id=org_facility_id)

    counts: dict[tuple[str, str], int] = defaultdict(int)
    for session in sessions:
        order = session.order
        if order is None:
            continue
        rows = resolve_order_diagnoses(order=order, patient_id=order.patient_id)
        increment_icd_counts(counts, rows)

    data = build_icd_frequency_rows(counts)
    total = sum(counts.values())

    return {
        "mode": "icd10",
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "data": data,
        "summary": {
            "total_diagnosis_lines": total,
            "distinct_icd10_codes": len(data),
            "total_sessions": sessions.count(),
            "grand_total": total,
        },
    }
