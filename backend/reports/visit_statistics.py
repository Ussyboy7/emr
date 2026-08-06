"""Visit statistics — status and demographic breakdown by time period."""
from __future__ import annotations

import csv
from datetime import date, timedelta
from io import StringIO
from typing import Any, Literal

from common.date_display import format_display_range

from django.db.models import Count, Q
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek

from patients.models import Visit

GroupBy = Literal["day", "week", "month"]

GROUP_BY_LABELS = {
    "day": "Daily",
    "week": "Weekly",
    "month": "Monthly",
}


def _format_period_label(dt: date, group_by: str) -> str:
    if group_by == "day":
        return dt.strftime("%b %d, %Y")
    if group_by == "week":
        end_of_week = dt + timedelta(days=6)
        return f"{dt.strftime('%b %d')} - {end_of_week.strftime('%b %d, %Y')}"
    return dt.strftime("%b %Y")


def _visit_annotations() -> dict[str, Any]:
    return {
        "completed": Count("id", filter=Q(status="completed")),
        "cancelled": Count("id", filter=Q(status="cancelled")),
        "in_progress": Count("id", filter=Q(status="in_progress")),
        "scheduled": Count("id", filter=Q(status__in=["scheduled", "pending"])),
        "total": Count("id"),
        "male": Count("id", filter=Q(patient__gender="male")),
        "female": Count("id", filter=Q(patient__gender="female")),
        "employee": Count("id", filter=Q(patient__category="employee")),
        "non_employee": Count("id", filter=~Q(patient__category="employee")),
        "officer": Count(
            "id",
            filter=Q(
                patient__category="employee",
                patient__employee_type__icontains="officer",
            ),
        ),
        "staff": Count(
            "id",
            filter=Q(patient__category="employee")
            & ~Q(patient__employee_type__icontains="officer"),
        ),
        "emp_dependent": Count(
            "id",
            filter=Q(
                patient__category="dependent",
                patient__dependent_type__icontains="employee",
            ),
        ),
        "ret_dependent": Count(
            "id",
            filter=Q(
                patient__category="dependent",
                patient__dependent_type__icontains="retiree",
            ),
        ),
        "nonnpa": Count("id", filter=Q(patient__category="nonnpa")),
        "retiree": Count("id", filter=Q(patient__category="retiree")),
    }


def build_visit_statistics_report(
    *,
    start_date: date,
    end_date: date,
    group_by: GroupBy = "month",
    org_facility_id: int | None = None,
) -> dict[str, Any]:
    if group_by not in GROUP_BY_LABELS:
        group_by = "month"

    visits = Visit.objects.filter(date__gte=start_date, date__lte=end_date)
    if org_facility_id is not None:
        visits = visits.filter(location_clinic_id=org_facility_id)
    trunc_fn = {"day": TruncDay, "week": TruncWeek, "month": TruncMonth}.get(
        group_by, TruncMonth
    )

    grouped = (
        visits.annotate(period=trunc_fn("date"))
        .values("period")
        .annotate(**_visit_annotations())
        .order_by("period")
    )

    data: list[dict[str, Any]] = []
    for entry in grouped:
        period_val = entry["period"]
        if period_val is None:
            continue
        row = {k: entry[k] for k in _visit_annotations()}
        data.append(
            {
                "period": period_val.isoformat(),
                "period_label": _format_period_label(period_val, group_by),
                **row,
            }
        )

    summary = visits.aggregate(**_visit_annotations())

    return {
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "group_by": group_by,
        "group_by_label": GROUP_BY_LABELS[group_by],
        "data": data,
        "summary": summary,
    }


def build_visit_statistics_csv(report: dict[str, Any]) -> str:
    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Visit Statistics",
            f"{format_display_range(report.get('period_start'), report.get('period_end'))}",
        ]
    )
    writer.writerow(["Grouping", report.get("group_by_label", "")])
    writer.writerow([])

    summary = report.get("summary") or {}
    writer.writerow(["Summary"])
    writer.writerow(["Completed", summary.get("completed", 0)])
    writer.writerow(["Cancelled", summary.get("cancelled", 0)])
    writer.writerow(["In Progress", summary.get("in_progress", 0)])
    writer.writerow(["Scheduled", summary.get("scheduled", 0)])
    writer.writerow(["Total Visits", summary.get("total", 0)])
    writer.writerow([])

    writer.writerow(
        [
            "Period",
            "Completed",
            "Cancelled",
            "In Progress",
            "Scheduled",
            "Total",
        ]
    )
    for row in report.get("data") or []:
        writer.writerow(
            [
                row.get("period_label", ""),
                row.get("completed", 0),
                row.get("cancelled", 0),
                row.get("in_progress", 0),
                row.get("scheduled", 0),
                row.get("total", 0),
            ]
        )
    writer.writerow(
        [
            "TOTAL",
            summary.get("completed", 0),
            summary.get("cancelled", 0),
            summary.get("in_progress", 0),
            summary.get("scheduled", 0),
            summary.get("total", 0),
        ]
    )
    writer.writerow([])

    writer.writerow(
        [
            "Period",
            "Male",
            "Female",
            "Officer",
            "Staff",
            "Employee",
            "Emp Dep",
            "Ret Dep",
            "Non-NPA",
            "Retiree",
            "Non-Employee",
            "Total",
        ]
    )
    for row in report.get("data") or []:
        writer.writerow(
            [
                row.get("period_label", ""),
                row.get("male", 0),
                row.get("female", 0),
                row.get("officer", 0),
                row.get("staff", 0),
                row.get("employee", 0),
                row.get("emp_dependent", 0),
                row.get("ret_dependent", 0),
                row.get("nonnpa", 0),
                row.get("retiree", 0),
                row.get("non_employee", 0),
                row.get("total", 0),
            ]
        )
    writer.writerow(
        [
            "TOTAL",
            summary.get("male", 0),
            summary.get("female", 0),
            summary.get("officer", 0),
            summary.get("staff", 0),
            summary.get("employee", 0),
            summary.get("emp_dependent", 0),
            summary.get("ret_dependent", 0),
            summary.get("nonnpa", 0),
            summary.get("retiree", 0),
            summary.get("non_employee", 0),
            summary.get("total", 0),
        ]
    )
    return buf.getvalue()
