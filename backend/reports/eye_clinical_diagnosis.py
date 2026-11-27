"""Ophthalmology clinical diagnosis — ICD-10 codes recorded by the eye clinic."""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from common.clinic_diagnoses import clinic_diagnoses_rows
from eyecare.models import EyeSession
from reports.icd_diagnosis_aggregation import finalize_icd_frequency_report, increment_icd_counts


def build_eye_clinical_diagnosis_report(
    period_start: date,
    period_end: date,
    *,
    limit: int | None = None,
    page: int | None = None,
    page_size: int | None = None,
    org_facility_id: int | None = None,
    search: str | None = None,
) -> dict:
    """Count the eye clinician's own ICD-10 diagnoses, once per completed session.

    The referring doctor's diagnoses are deliberately ignored: eye orders are
    seeded with the consultation diagnosis, which is not an eye clinic finding.
    """
    from common.report_period import filter_inclusive_date_range

    sessions = filter_inclusive_date_range(
        EyeSession.objects.filter(
            status="completed",
            order__patient__isnull=False,
        ),
        "completed_at",
        period_start,
        period_end,
    ).select_related("order").order_by("completed_at")
    if org_facility_id is not None:
        sessions = sessions.filter(order__location_clinic_id=org_facility_id)

    counts: dict[tuple[str, str], int] = defaultdict(int)
    total_sessions = 0
    uncoded_sessions = 0
    for session in sessions:
        total_sessions += 1
        rows = clinic_diagnoses_rows(getattr(session.order, "clinic_diagnoses", None))
        if not rows:
            uncoded_sessions += 1
            continue
        increment_icd_counts(counts, rows)

    data, summary = finalize_icd_frequency_report(
        counts,
        limit=limit,
        page=page,
        page_size=page_size,
        search=search,
    )
    summary["total_sessions"] = total_sessions
    summary["uncoded_sessions"] = uncoded_sessions

    return {
        "mode": "icd10",
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "data": data,
        "summary": summary,
    }
