"""Bundled comprehensive MR report — all section reports in one payload."""
from __future__ import annotations

from datetime import date
from typing import Any, Callable

from patients.models import Visit
from reports.attendance_statistics import build_attendance_statistics_report
from reports.attendance_summary_report import build_attendance_summary_report
from reports.disease_pattern_report import (
    build_disease_pattern_compared_report,
    build_disease_pattern_report,
)
from reports.eye_clinical_diagnosis import build_eye_clinical_diagnosis_report
from reports.lab_attendance_report import build_lab_attendance_report
from reports.observation_admissions import build_observation_admissions_report
from reports.physio_clinical_diagnosis import build_physio_clinical_diagnosis_report
from reports.radiological_report import build_radiological_report
from reports.referral_tracking_report import build_referral_tracking_report


def _lifecycle_summary(period_start: date, period_end: date, org_facility_id: int | None = None) -> dict:
    history = Visit.objects.filter(status__in=["completed", "in_progress"]).select_related("patient")
    if org_facility_id is not None:
        history = history.filter(location_clinic_id=org_facility_id)
    period_visits = history.filter(date__gte=period_start, date__lte=period_end)
    patient_ids = period_visits.values_list("patient_id", flat=True).distinct()
    total_seen = patient_ids.count()
    return {
        "total_unique_patients_seen": total_seen,
        "total_visits": period_visits.count(),
    }


SECTION_BUILDERS: list[tuple[str, str, Callable[[date, date], dict[str, Any]]]] = [
    ("attendance_statistics", "BTMC Attendance Statistics", lambda s, e: build_attendance_statistics_report(start_date=s, end_date=e)),
    ("attendance_summary", "Attendance Summary (Current vs Previous)", lambda s, e: build_attendance_summary_report(s, e, lifecycle_summary=_lifecycle_summary(s, e))),
    ("laboratory_attendance", "Laboratory Attendance", build_lab_attendance_report),
    ("radiological_services", "Radiological Services", build_radiological_report),
    ("observation_admissions", "Patients Placed on Observation", build_observation_admissions_report),
    ("referral_tracking", "Referrals to Retainership Hospitals", build_referral_tracking_report),
    ("physio_clinical_diagnosis", "Physiotherapy Clinical Diagnosis", build_physio_clinical_diagnosis_report),
    ("eye_clinical_diagnosis", "Ophthalmology Clinical Diagnosis", build_eye_clinical_diagnosis_report),
    ("disease_pattern", "Disease Pattern (ICD-10)", build_disease_pattern_report),
    ("disease_pattern_compared", "Disease Pattern Compared", lambda s, e: build_disease_pattern_compared_report(s, e, periods=3)),
]


def build_comprehensive_report_bundle(period_start: date, period_end: date, org_facility_id: int | None = None) -> dict:
    sections: list[dict[str, Any]] = []
    for key, title, builder in SECTION_BUILDERS:
        try:
            if key == "attendance_summary":
                payload = build_attendance_summary_report(
                    period_start,
                    period_end,
                    lifecycle_summary=_lifecycle_summary(period_start, period_end, org_facility_id),
                )
            else:
                payload = builder(period_start, period_end)
        except Exception as exc:
            payload = {"error": str(exc)}
        sections.append({"key": key, "title": title, "report": payload})

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "title": "Comprehensive Report",
        "sections": sections,
        "section_count": len(sections),
    }
