"""Weekend call duty — attendable visits on Saturday and Sunday."""
from __future__ import annotations

from datetime import date

from django.db.models import Count, Q
from django.db.models.functions import ExtractWeekDay, TruncMonth

from common.date_display import format_display_month_year
from reports.attendance_statistics import (
    distinct_patient_gender_counts_for_filter,
    mr_categorized_patients_q,
    mr_category_row_filters,
)

# Django ExtractWeekDay: Sunday=1 … Saturday=7
WEEKEND_WEEKDAYS = (1, 7)


def _weekend_visits_queryset(attendable_visits_queryset, period_start: date, period_end: date):
    return (
        attendable_visits_queryset()
        .filter(
            date__gte=period_start,
            date__lte=period_end,
            patient__isnull=False,
        )
        .annotate(weekday=ExtractWeekDay("date"))
        .filter(weekday__in=WEEKEND_WEEKDAYS)
        .select_related("patient")
    )


def build_weekend_duty_report(
    period_start: date,
    period_end: date,
    *,
    attendable_visits_queryset,
) -> dict:
    visits = _weekend_visits_queryset(
        attendable_visits_queryset, period_start, period_end
    )
    total_visit_records = visits.count()
    distinct_patients = visits.values("patient").distinct().count()

    category_rows = []
    grand_patients = 0
    total_male = total_female = 0
    officers_patients = staff_patients = 0

    for sn, label, filt in mr_category_row_filters():
        male, female, patients = distinct_patient_gender_counts_for_filter(visits, filt)
        visit_records = visits.filter(filt).count()
        total_male += male
        total_female += female
        grand_patients += patients
        if sn == 1:
            officers_patients = patients
        elif sn == 2:
            staff_patients = patients
        category_rows.append(
            {
                "sn": sn,
                "category": label,
                "male": male,
                "female": female,
                "patients": patients,
                "visit_records": visit_records,
                "percentage": 0.0,
            }
        )

    other_male, other_female, other_patients = distinct_patient_gender_counts_for_filter(
        visits, ~mr_categorized_patients_q()
    )
    if other_patients > 0:
        total_male += other_male
        total_female += other_female
        grand_patients += other_patients
        category_rows.append(
            {
                "sn": len(category_rows) + 1,
                "category": "Other",
                "male": other_male,
                "female": other_female,
                "patients": other_patients,
                "visit_records": visits.filter(~mr_categorized_patients_q()).count(),
                "percentage": 0.0,
            }
        )

    for row in category_rows:
        row["percentage"] = round(
            (row["patients"] / distinct_patients * 100) if distinct_patients > 0 else 0,
            1,
        )

    employee_patients = visits.filter(Q(patient__category="employee")).values("patient").distinct().count()
    non_employee_patients = distinct_patients - employee_patients

    monthly_rows = (
        visits.annotate(month_start=TruncMonth("date"))
        .values("month_start")
        .annotate(
            visit_records=Count("id"),
            patients=Count("patient", distinct=True),
        )
        .order_by("month_start")
    )
    monthly_data = []
    for idx, row in enumerate(monthly_rows, start=1):
        month_start = row["month_start"]
        label = (
            format_display_month_year(month_start.date() if hasattr(month_start, "date") else month_start)
            if month_start
            else "Unknown"
        )
        monthly_data.append(
            {
                "sn": idx,
                "month": label,
                "period_label": label,
                "count": row["visit_records"] or 0,
                "visit_records": row["visit_records"] or 0,
                "patients": row["patients"] or 0,
            }
        )

    return {
        "summary": {
            "total_weekend_visits": total_visit_records,
            "distinct_patients": distinct_patients,
            "total_employee_patients": employee_patients,
            "total_non_employee_patients": max(non_employee_patients, 0),
            "officers": officers_patients,
            "staff": staff_patients,
            "total": total_visit_records,
        },
        "category_breakdown": category_rows,
        "monthly_data": monthly_data,
    }
