"""Patients placed on observation — admission events by category."""
from __future__ import annotations

from datetime import date

from django.db.models import Q

from reports.attendance_statistics import (
    CATEGORY_LABELS,
    mr_category_row_filters,
    patient_category_bucket,
)
from wards.models import PatientAdmission

OBSERVATION_TYPES = ("observation", "daycare_observation")


def build_observation_admissions_report(
    period_start: date,
    period_end: date,
    *,
    org_facility_id: int | None = None,
) -> dict:
    admissions = (
        PatientAdmission.objects.filter(
            admission_type__in=OBSERVATION_TYPES,
            admission_date__date__gte=period_start,
            admission_date__date__lte=period_end,
            patient__isnull=False,
        )
        .select_related("patient")
        .order_by("admission_date")
    )
    if org_facility_id is not None:
        admissions = admissions.filter(visit__location_clinic_id=org_facility_id)

    total_events = admissions.count()

    # Build per-category counts (events, not distinct patients)
    row_counts: dict[str, dict[str, int]] = {}
    for _, label, filt in mr_category_row_filters():
        key = label.lower().replace(" ", "_").replace("-", "_")
        if "employee_dependents" in key or label == "Employee Dependents":
            key = "employee_dependants"
        elif label == "Non-NPA":
            key = "non_npa"
        elif label == "Retirees":
            key = "retirees"
        elif label == "Retiree Dependents":
            key = "retiree_dependents"
        elif label == "Officers":
            key = "officers"
        elif label == "Staff":
            key = "staff"
        qs = admissions.filter(filt)
        male = qs.filter(patient__gender="male").count()
        female = qs.filter(patient__gender="female").count()
        row_counts[key] = {"male": male, "female": female, "total": qs.count()}

    # Uncategorized admissions
    categorized_q = Q()
    for _, _, filt in mr_category_row_filters():
        categorized_q |= filt
    other_qs = admissions.exclude(categorized_q)
    if other_qs.exists():
        row_counts["other"] = {
            "male": other_qs.filter(patient__gender="male").count(),
            "female": other_qs.filter(patient__gender="female").count(),
            "total": other_qs.count(),
        }

    display_order = [
        ("officers", "Officers"),
        ("staff", "Staff"),
        ("employee_dependants", CATEGORY_LABELS.get("employee_dependants", "Employee Dependants")),
        ("retiree_dependents", CATEGORY_LABELS.get("retiree_dependents", "Retiree Dependents")),
        ("retirees", CATEGORY_LABELS.get("retirees", "Retirees")),
        ("non_npa", CATEGORY_LABELS.get("non_npa", "Non NPA")),
    ]

    data = []
    for sn, (key, label) in enumerate(display_order, start=1):
        counts = row_counts.get(key, {"male": 0, "female": 0, "total": 0})
        data.append(
            {
                "sn": sn,
                "category": label,
                "key": key,
                "male": counts["male"],
                "female": counts["female"],
                "total": counts["total"],
                "percentage": round((counts["total"] / total_events * 100) if total_events > 0 else 0, 1),
            }
        )

    if row_counts.get("other", {}).get("total", 0) > 0:
        o = row_counts["other"]
        data.append(
            {
                "sn": len(data) + 1,
                "category": "Other",
                "key": "other",
                "male": o["male"],
                "female": o["female"],
                "total": o["total"],
                "percentage": round((o["total"] / total_events * 100) if total_events > 0 else 0, 1),
            }
        )

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "data": data,
        "summary": {
            "total_admission_events": total_events,
            "distinct_patients": admissions.values("patient").distinct().count(),
            "total_male": sum(r["male"] for r in data),
            "total_female": sum(r["female"] for r in data),
        },
    }


def admission_category_key(admission: PatientAdmission) -> str | None:
    """Helper for tests — bucket a single admission."""
    patient = admission.patient
    if patient is None:
        return None
    return patient_category_bucket(patient)
