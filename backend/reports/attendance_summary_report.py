"""Attendance summary by patient category with optional period comparison."""
from __future__ import annotations

from datetime import date

from django.db.models import QuerySet

from patients.models import Visit
from reports.period_compare import pct_change, previous_period_bounds


def _category_visit_sets(visits_queryset: QuerySet):
    employee_visits = visits_queryset.filter(patient__category="employee")
    officers_visits = employee_visits.exclude(
        patient__employee_type__isnull=True
    ).exclude(patient__employee_type="").filter(patient__employee_type__icontains="officer")
    staff_visits = employee_visits.exclude(patient__employee_type__icontains="officer")
    dependents_visits = visits_queryset.filter(patient__category="dependent")
    emp_dep_visits = dependents_visits.exclude(
        patient__dependent_type__isnull=True
    ).filter(patient__dependent_type__icontains="employee")
    ret_dep_visits = dependents_visits.exclude(
        patient__dependent_type__isnull=True
    ).filter(patient__dependent_type__icontains="retiree")
    nonnpa_visits = visits_queryset.filter(patient__category="nonnpa")
    retiree_visits = visits_queryset.filter(patient__category="retiree")
    return (
        officers_visits,
        staff_visits,
        emp_dep_visits,
        ret_dep_visits,
        nonnpa_visits,
        retiree_visits,
    )


def _distinct_counts(qs: QuerySet) -> tuple[int, int, int]:
    male = qs.filter(patient__gender="male").values("patient").distinct().count()
    female = qs.filter(patient__gender="female").values("patient").distinct().count()
    total = qs.values("patient").distinct().count()
    return male, female, total


def build_attendance_summary_for_visits(visits_queryset: QuerySet) -> dict:
    (
        officers_visits,
        staff_visits,
        emp_dep_visits,
        ret_dep_visits,
        nonnpa_visits,
        retiree_visits,
    ) = _category_visit_sets(visits_queryset)

    officers_male, officers_female, officers_count = _distinct_counts(officers_visits)
    staff_male, staff_female, staff_count = _distinct_counts(staff_visits)
    emp_dep_male, emp_dep_female, emp_dep_count = _distinct_counts(emp_dep_visits)
    ret_dep_male, ret_dep_female, ret_dep_count = _distinct_counts(ret_dep_visits)
    nonnpa_male, nonnpa_female, nonnpa_count = _distinct_counts(nonnpa_visits)
    retiree_male, retiree_female, retiree_count = _distinct_counts(retiree_visits)

    total_employee = officers_count + staff_count
    total_non_employee = emp_dep_count + ret_dep_count + nonnpa_count + retiree_count
    grand_total = total_employee + total_non_employee
    total_male = officers_male + staff_male + emp_dep_male + ret_dep_male + nonnpa_male + retiree_male
    total_female = (
        officers_female + staff_female + emp_dep_female + ret_dep_female + nonnpa_female + retiree_female
    )

    categories = [
        {
            "key": "officers",
            "sn": 1,
            "category": "Officers",
            "employee": officers_count,
            "non_employee": 0,
            "male": officers_male,
            "female": officers_female,
            "total": officers_count,
            "percentage": round((officers_count / grand_total * 100) if grand_total > 0 else 0, 1),
        },
        {
            "key": "staff",
            "sn": 2,
            "category": "Staff",
            "employee": staff_count,
            "non_employee": 0,
            "male": staff_male,
            "female": staff_female,
            "total": staff_count,
            "percentage": round((staff_count / grand_total * 100) if grand_total > 0 else 0, 1),
        },
        {
            "key": "employee_dependants",
            "sn": 3,
            "category": "Employee Dependants",
            "employee": 0,
            "non_employee": emp_dep_count,
            "male": emp_dep_male,
            "female": emp_dep_female,
            "total": emp_dep_count,
            "percentage": round((emp_dep_count / grand_total * 100) if grand_total > 0 else 0, 1),
        },
        {
            "key": "retiree_dependents",
            "sn": 4,
            "category": "Retiree Dependents",
            "employee": 0,
            "non_employee": ret_dep_count,
            "male": ret_dep_male,
            "female": ret_dep_female,
            "total": ret_dep_count,
            "percentage": round((ret_dep_count / grand_total * 100) if grand_total > 0 else 0, 1),
        },
        {
            "key": "non_npa",
            "sn": 5,
            "category": "Non NPA",
            "employee": 0,
            "non_employee": nonnpa_count,
            "male": nonnpa_male,
            "female": nonnpa_female,
            "total": nonnpa_count,
            "percentage": round((nonnpa_count / grand_total * 100) if grand_total > 0 else 0, 1),
        },
        {
            "key": "retirees",
            "sn": 6,
            "category": "Retirees",
            "employee": 0,
            "non_employee": retiree_count,
            "male": retiree_male,
            "female": retiree_female,
            "total": retiree_count,
            "percentage": round((retiree_count / grand_total * 100) if grand_total > 0 else 0, 1),
        },
    ]

    return {
        "data": categories,
        "summary": {
            "total_employee": total_employee,
            "total_non_employee": total_non_employee,
            "total_male": total_male,
            "total_female": total_female,
            "grand_total": grand_total,
        },
    }


def build_attendance_summary_report(
    period_start: date,
    period_end: date,
    *,
    history_queryset: QuerySet | None = None,
    lifecycle_summary: dict | None = None,
    include_compare: bool = True,
) -> dict:
    if history_queryset is None:
        history_queryset = Visit.objects.filter(status__in=["completed", "in_progress"]).select_related(
            "patient"
        )

    current_visits = history_queryset.filter(date__gte=period_start, date__lte=period_end)
    current = build_attendance_summary_for_visits(current_visits)

    report = {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "data": current["data"],
        "summary": {**(lifecycle_summary or {}), **current["summary"]},
    }

    if not include_compare:
        return report

    prev_start, prev_end = previous_period_bounds(period_start, period_end)
    previous_visits = history_queryset.filter(date__gte=prev_start, date__lte=prev_end)
    previous = build_attendance_summary_for_visits(previous_visits)

    prev_by_key = {row["key"]: row for row in previous["data"]}
    compare_rows = []
    for row in current["data"]:
        prev_total = prev_by_key.get(row["key"], {}).get("total", 0)
        change = pct_change(row["total"], prev_total)
        compare_rows.append(
            {
                **row,
                "previous_total": prev_total,
                "change_percent": change,
            }
        )

    report["previous_period"] = {
        "period_start": prev_start.isoformat(),
        "period_end": prev_end.isoformat(),
        "grand_total": previous["summary"]["grand_total"],
    }
    report["data"] = compare_rows
    report["summary"]["previous_grand_total"] = previous["summary"]["grand_total"]
    report["summary"]["grand_total_change_percent"] = pct_change(
        current["summary"]["grand_total"],
        previous["summary"]["grand_total"],
    )
    return report
