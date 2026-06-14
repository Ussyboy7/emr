"""Live aggregates for the main clinical analytics dashboard."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from django.db.models import Count, F, Min, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone

from consultation.models import ConsultationSession, Diagnosis
from laboratory.models import LabOrder, LabTest
from patients.models import Patient, Visit
from pharmacy.models import MedicationInventory, Prescription


WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _category_rows(visits_qs) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Distinct patients per NPA category bucket in the visit cohort."""
    bucket_defs = [
        ("officers", "Officers", Q(patient__category="employee", patient__employee_type__icontains="officer")),
        ("staff", "Staff", Q(patient__category="employee") & ~Q(patient__employee_type__icontains="officer")),
        (
            "employee_dependents",
            "Employee Dependents",
            Q(patient__category="dependent", patient__dependent_type__icontains="employee"),
        ),
        (
            "retiree_dependents",
            "Retiree Dependents",
            Q(patient__category="dependent", patient__dependent_type__icontains="retiree"),
        ),
        ("non_npa", "Non-NPA", Q(patient__category="nonnpa")),
        ("retirees", "Retirees", Q(patient__category="retiree")),
    ]
    rows: list[dict[str, Any]] = []
    totals = {"male": 0, "female": 0, "total": 0}

    for idx, (key, label, filt) in enumerate(bucket_defs, start=1):
        qs = visits_qs.filter(filt)
        male = qs.filter(patient__gender="male").values("patient").distinct().count()
        female = qs.filter(patient__gender="female").values("patient").distinct().count()
        total = qs.values("patient").distinct().count()
        totals["male"] += male
        totals["female"] += female
        totals["total"] += total
        rows.append(
            {
                "sn": idx,
                "key": key,
                "label": label,
                "male": male,
                "female": female,
                "total": total,
                "percentage": 0,
            }
        )

    grand = totals["total"] or 1
    for row in rows:
        row["percentage"] = round((row["total"] / grand) * 100, 1)

    return rows, totals


def build_clinical_dashboard(
    start_dt: datetime, end_dt: datetime, *, all_time: bool = False
) -> dict[str, Any]:
    start_d = start_dt.date()
    end_d = end_dt.date()

    visits = Visit.objects.filter(date__gte=start_d, date__lte=end_d).select_related("patient")
    total_visits = visits.count()
    completed_visits = visits.filter(status="completed").count()
    completion_rate = round((completed_visits / total_visits * 100) if total_visits else 0, 1)

    unique_patients_seen = visits.values("patient").distinct().count()
    total_active_patients = Patient.objects.filter(is_active=True).count()

    sessions = ConsultationSession.objects.filter(
        started_at__gte=start_dt,
        started_at__lte=end_dt,
    ).exclude(status="cancelled")
    completed_sessions = sessions.filter(status="completed")
    completed_count = completed_sessions.count()

    durations = []
    for s in completed_sessions.filter(ended_at__isnull=False).iterator():
        if s.ended_at and s.started_at:
            durations.append((s.ended_at - s.started_at).total_seconds() / 60)
    avg_duration = round(sum(durations) / len(durations), 1) if durations else 0.0
    avg_wait = avg_duration  # best available proxy without queue timestamps

    lab_orders = LabOrder.objects.filter(ordered_at__gte=start_dt, ordered_at__lte=end_dt)
    tests_qs = LabTest.objects.filter(
        order__ordered_at__gte=start_dt,
        order__ordered_at__lte=end_dt,
    )
    tests_total = tests_qs.count()
    tests_verified = tests_qs.filter(status="verified").count()
    lab_completion = round((tests_verified / tests_total * 100) if tests_total else 0, 1)

    turnaround_samples = []
    for test in tests_qs.filter(
        status="verified",
        verified_at__isnull=False,
        order__ordered_at__isnull=False,
    )[:200]:
        if test.verified_at and test.order.ordered_at:
            turnaround_samples.append(
                (test.verified_at - test.order.ordered_at).total_seconds() / 3600
            )
    avg_turnaround = (
        round(sum(turnaround_samples) / len(turnaround_samples), 1)
        if turnaround_samples
        else 0.0
    )

    top_tests = list(
        tests_qs.values("name")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    test_distribution = [
        {"test": row["name"] or "Unknown", "count": row["count"]} for row in top_tests
    ]

    rx_period = Prescription.objects.filter(
        prescribed_at__gte=start_dt,
        prescribed_at__lte=end_dt,
    ).exclude(status="cancelled")
    dispensed_period = rx_period.filter(status="dispensed")
    pending_rx = Prescription.objects.filter(status="pending").count()
    low_stock = MedicationInventory.objects.filter(quantity__lte=F("min_stock_level")).count()

    wait_samples = []
    for rx in dispensed_period.filter(dispensed_at__isnull=False, prescribed_at__isnull=False)[:200]:
        wait_samples.append((rx.dispensed_at - rx.prescribed_at).total_seconds() / 60)
    avg_rx_wait = round(sum(wait_samples) / len(wait_samples), 1) if wait_samples else 0.0

    diag_qs = Diagnosis.objects.filter(
        diagnosed_at__gte=start_dt,
        diagnosed_at__lte=end_dt,
        icd10_code__isnull=False,
    )
    diag_total = diag_qs.count()
    top_diag_rows = (
        diag_qs.values(code=F("icd10_code__code"), description=F("icd10_code__description"))
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    top_diagnoses = [
        {
            "diagnosis": (
                f"{row['code']} - {row['description']}"
                if row.get("description")
                else row.get("code") or "Unknown"
            ),
            "cases": row["count"],
        }
        for row in top_diag_rows
    ]

    clinic_distribution: dict[str, int] = defaultdict(int)
    for row in visits.values("clinic").annotate(c=Count("id")).order_by("-c"):
        label = (row["clinic"] or "Unspecified").strip() or "Unspecified"
        clinic_distribution[label] += row["c"]

    category_rows, attendance_totals = _category_rows(visits)
    cat_totals = attendance_totals["total"] or 1
    patient_demographics_percentages = {
        "employee": round(
            (
                category_rows[0]["total"]
                + category_rows[1]["total"]
                + category_rows[2]["total"]
            )
            / cat_totals
            * 100
        ),
        "dependent": round(category_rows[2]["total"] / cat_totals * 100),
        "retiree": round(category_rows[5]["total"] / cat_totals * 100),
        "non_npa": round(category_rows[4]["total"] / cat_totals * 100),
    }

    monthly_visits = (
        visits.annotate(month=TruncMonth("date"))
        .values("month")
        .annotate(visits=Count("id"))
        .order_by("month")
    )
    new_patients_by_month: dict[str, int] = defaultdict(int)
    for row in (
        Visit.objects.values("patient_id")
        .annotate(first_date=Min("date"))
        .filter(first_date__gte=start_d, first_date__lte=end_d)
    ):
        first_date = row["first_date"]
        if not first_date:
            continue
        new_patients_by_month[first_date.strftime("%b %Y")] += 1

    visits_trend = []
    for row in monthly_visits:
        month_dt = row["month"]
        if not month_dt:
            continue
        month_start = month_dt.date() if isinstance(month_dt, datetime) else month_dt
        month_label = month_start.strftime("%b %Y")
        visits_trend.append(
            {
                "month": month_label,
                "visits": row["visits"],
                "newPatients": new_patients_by_month.get(month_label, 0),
            }
        )

    weekly: dict[str, dict[str, int]] = {
        label: {"patients": 0, "consultations": 0, "lab_tests": 0, "prescriptions": 0}
        for label in WEEKDAY_LABELS
    }
    for v in visits.iterator():
        wd = WEEKDAY_LABELS[v.date.weekday()]
        weekly[wd]["patients"] += 1
    for s in sessions.iterator():
        wd = WEEKDAY_LABELS[timezone.localtime(s.started_at).weekday()]
        weekly[wd]["consultations"] += 1
    for t in tests_qs.select_related("order").iterator():
        ordered = t.order.ordered_at if t.order_id else None
        if ordered:
            wd = WEEKDAY_LABELS[timezone.localtime(ordered).weekday()]
            weekly[wd]["lab_tests"] += 1
    for rx in rx_period.iterator():
        if rx.prescribed_at:
            wd = WEEKDAY_LABELS[timezone.localtime(rx.prescribed_at).weekday()]
            weekly[wd]["prescriptions"] += 1

    weekly_activity = [{"day": day, **weekly[day]} for day in WEEKDAY_LABELS]

    period_meta = (
        {"all_time": True, "label": "All time"}
        if all_time
        else {"start_date": start_d.isoformat(), "end_date": end_d.isoformat()}
    )

    return {
        "period": period_meta,
        "metrics": {
            "total_patients": total_active_patients,
            "total_visits": total_visits,
            "avg_wait_time_minutes": avg_wait,
            "completion_rate_percentage": completion_rate,
        },
        "overview": {
            "patients": unique_patients_seen,
            "clinical": completed_count,
            "laboratory": lab_orders.count(),
            "pharmacy": dispensed_period.count(),
        },
        "visits_trend": visits_trend,
        "clinic_distribution": dict(clinic_distribution),
        "patient_demographics_percentages": patient_demographics_percentages,
        "top_diagnoses": top_diagnoses,
        "consultation_metrics": {
            "completed_sessions": completed_count,
            "avg_duration": avg_duration,
            "avg_wait_time": avg_wait,
        },
        "lab_metrics": {
            "tests_this_month": tests_total,
            "avg_turnaround_hours": avg_turnaround,
            "completion_rate": lab_completion,
        },
        "test_distribution": test_distribution,
        "pharmacy_metrics": {
            "dispensed_this_month": dispensed_period.count(),
            "pending_orders": pending_rx,
            "avg_wait_time": avg_rx_wait,
            "low_stock_items": low_stock,
        },
        "weekly_activity": weekly_activity,
        "patient_demographics": {
            "attendance_by_category": category_rows,
            "attendance_totals": attendance_totals,
        },
    }
