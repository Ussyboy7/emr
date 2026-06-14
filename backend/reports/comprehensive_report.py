"""MR executive summary — reuses cohort and activity logic from dedicated reports."""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time

from django.db.models import Count
from django.db.models.functions import ExtractYear
from django.utils import timezone

from consultation.models import ConsultationSession, Diagnosis, Referral
from laboratory.models import LabOrder, LabResult, LabTest
from nursing.procedure_queries import (
    base_procedures_queryset,
    filter_procedures_by_history_type,
    filter_procedures_by_performed_period,
)
from patients.models import MedicalCertificate, Visit
from pharmacy.models import Prescription
from radiology.models import RadiologyStudy

NOTIFIABLE_PREFIXES = (
    "A00", "A01", "A15", "A16", "A17", "A18", "A19",
    "A20", "A22", "A33", "A34", "A35", "A36", "A39",
    "A80", "A90", "A95", "A96", "A98",
    "B03", "B04", "B05",
    "B15", "B16", "B17", "B18", "B19",
    "B50", "B51", "B52", "B53", "B54",
    "U07",
)


def _period_datetimes(period_start: date, period_end: date) -> tuple[datetime, datetime]:
    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(period_start, time.min), tz)
    end_dt = timezone.make_aware(datetime.combine(period_end, time.max), tz)
    return start_dt, end_dt


def _visit_trend(visits_qs, period_start: date, period_end: date, *, all_time: bool):
    """Distinct patients per month (single-year) or per year (all-time / multi-year)."""
    month_names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]
    multi_year = period_end.year > period_start.year
    if all_time or multi_year:
        rows = (
            visits_qs.annotate(y=ExtractYear("date"))
            .values("y")
            .annotate(count=Count("patient", distinct=True))
            .order_by("y")
        )
        return "year", [
            {"period_label": str(row["y"]), "month": str(row["y"]), "count": row["count"] or 0}
            for row in rows
            if row["y"] is not None
        ]

    year = period_start.year
    trend = []
    for month_num in range(1, 13):
        last_day = monthrange(year, month_num)[1]
        month_start = period_start.replace(year=year, month=month_num, day=1)
        month_end = period_end.replace(year=year, month=month_num, day=last_day)
        if month_end < period_start or month_start > period_end:
            continue
        count = (
            visits_qs.filter(date__year=year, date__month=month_num)
            .values("patient")
            .distinct()
            .count()
        )
        label = month_names[month_num - 1]
        trend.append({"period_label": label, "month": label, "count": count})
    return "month", trend


def _category_breakdown(visits_qs) -> tuple[list[dict], dict]:
    def counts(qs):
        male = qs.filter(patient__gender="male").values("patient").distinct().count()
        female = qs.filter(patient__gender="female").values("patient").distinct().count()
        total = qs.values("patient").distinct().count()
        return male, female, total

    buckets = [
        ("Officers", visits_qs.filter(patient__category="employee", patient__employee_type__icontains="officer")),
        ("Staff", visits_qs.filter(patient__category="employee").exclude(patient__employee_type__icontains="officer")),
        ("Employee Dependents", visits_qs.filter(patient__category="dependent", patient__dependent_type__icontains="employee")),
        ("Retiree Dependents", visits_qs.filter(patient__category="dependent", patient__dependent_type__icontains="retiree")),
        ("Non-NPA", visits_qs.filter(patient__category="nonnpa")),
        ("Retirees", visits_qs.filter(patient__category="retiree")),
    ]
    rows = []
    total_male = total_female = grand = 0
    for sn, (label, qs) in enumerate(buckets, start=1):
        male, female, total = counts(qs)
        total_male += male
        total_female += female
        grand += total
        rows.append({"sn": sn, "category": label, "male": male, "female": female, "total": total, "percentage": 0.0})
    for row in rows:
        row["percentage"] = round((row["total"] / grand * 100) if grand > 0 else 0, 1)
    summary = {
        "total_employee": rows[0]["total"] + rows[1]["total"],
        "total_non_employee": rows[2]["total"] + rows[3]["total"] + rows[4]["total"] + rows[5]["total"],
        "total_male": total_male,
        "total_female": total_female,
        "grand_total": grand,
    }
    return rows, summary


def _services_activities(period_start: date, period_end: date) -> dict:
    procedures = filter_procedures_by_performed_period(
        base_procedures_queryset(), start_date=period_start, end_date=period_end
    )
    injections = filter_procedures_by_history_type(procedures, "injection").count()
    dressing = filter_procedures_by_history_type(procedures, "dressing").count()
    observations = filter_procedures_by_history_type(procedures, "ward_admission").count()
    sick_leave = MedicalCertificate.objects.filter(
        purpose="illness",
        issued_at__date__gte=period_start,
        issued_at__date__lte=period_end,
    ).count()
    referrals = Referral.objects.filter(
        referred_at__date__gte=period_start,
        referred_at__date__lte=period_end,
    ).count()
    total = injections + dressing + sick_leave + referrals + observations
    return {
        "injections": injections,
        "dressing": dressing,
        "sick_leave": sick_leave,
        "referrals": referrals,
        "observations": observations,
        "total": total,
    }


def _top_clinics(visits_qs, *, limit: int = 5) -> list[dict]:
    rows = (
        visits_qs.exclude(clinic__isnull=True)
        .exclude(clinic="")
        .values("clinic")
        .annotate(count=Count("id"))
        .order_by("-count")[:limit]
    )
    return [
        {"clinic": (row["clinic"] or "Unspecified").strip() or "Unspecified", "count": row["count"] or 0}
        for row in rows
    ]


def _weekend_distinct_patients(visits_qs) -> int:
    weekend_ids = [
        vid
        for vid, vdate in visits_qs.values_list("id", "date")
        if vdate.weekday() in (5, 6)
    ]
    if not weekend_ids:
        return 0
    return visits_qs.filter(id__in=weekend_ids).values("patient").distinct().count()


def build_comprehensive_report(
    period_start: date,
    period_end: date,
    *,
    all_time: bool,
    lifecycle_builder,
    attendable_visits_queryset,
) -> dict:
    """
    Build MR executive summary payload.

    ``lifecycle_builder`` and ``attendable_visits_queryset`` are injected from views
    to avoid circular imports with reports.views.
    """
    start_dt, end_dt = _period_datetimes(period_start, period_end)
    year_int = period_end.year if all_time else period_start.year

    attendable = attendable_visits_queryset().filter(
        date__gte=period_start,
        date__lte=period_end,
    )
    period_visits = Visit.objects.filter(date__gte=period_start, date__lte=period_end)

    lifecycle = lifecycle_builder(
        period_visits_queryset=attendable,
        history_visits_queryset=Visit.objects.all(),
        start_date=period_start,
        end_date=period_end,
    )

    visit_status = {
        "completed": period_visits.filter(status="completed").count(),
        "in_progress": period_visits.filter(status="in_progress").count(),
        "cancelled": period_visits.filter(status="cancelled").count(),
        "scheduled": period_visits.filter(status="scheduled").count(),
    }
    visit_records = attendable.count()

    lab_orders = LabOrder.objects.filter(
        ordered_at__date__gte=period_start,
        ordered_at__date__lte=period_end,
    )
    lab_order_count = lab_orders.count()
    lab_patients = lab_orders.values("patient").distinct().count()
    lab_test_count = LabTest.objects.filter(order__in=lab_orders).count()

    prescriptions_qs = Prescription.objects.filter(
        prescribed_at__date__gte=period_start,
        prescribed_at__date__lte=period_end,
    )
    dispensed_orders = Prescription.objects.filter(
        status="dispensed",
        dispensed_at__isnull=False,
        dispensed_at__date__gte=period_start,
        dispensed_at__date__lte=period_end,
    ).count()

    radiology_studies = RadiologyStudy.objects.filter(
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    ).count()

    consultations_completed = ConsultationSession.objects.filter(
        started_at__gte=start_dt,
        started_at__lte=end_dt,
        status="completed",
    ).count()

    critical_lab = LabResult.objects.filter(
        overall_status="critical",
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    ).count()

    notifiable = Diagnosis.objects.filter(
        icd10_code__code__startswith=NOTIFIABLE_PREFIXES,
        diagnosed_at__date__gte=period_start,
        diagnosed_at__date__lte=period_end,
    ).count()

    services = _services_activities(period_start, period_end)
    categories, category_summary = _category_breakdown(attendable)
    trend_mode, monthly_trend = _visit_trend(attendable, period_start, period_end, all_time=all_time)

    return {
        "year": str(year_int),
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "trend_mode": trend_mode,
        "lifecycle": lifecycle,
        "visit_status": visit_status,
        "overview": {
            "visit_records": visit_records,
            "unique_patients_seen": lifecycle.get("total_unique_patients_seen", 0),
            "consultations_completed": consultations_completed,
            "weekend_patients": _weekend_distinct_patients(attendable),
            "total_prescriptions": prescriptions_qs.count(),
            "dispensed_prescriptions": dispensed_orders,
            "lab_orders": lab_order_count,
            "lab_patients": lab_patients,
            "total_lab_tests": lab_test_count,
            "radiology_studies": radiology_studies,
        },
        "services_activities": services,
        "compliance": {
            "critical_lab_results": critical_lab,
            "notifiable_diagnoses": notifiable,
        },
        "summary": category_summary,
        "category_breakdown": categories,
        "top_clinics": _top_clinics(attendable),
        "monthly_trend": monthly_trend,
    }
