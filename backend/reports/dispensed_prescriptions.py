"""Prescription order counts by period (one order per row, not per medication line)."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from django.db.models import Count, QuerySet
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek

GroupBy = Literal["day", "week", "month"]

GROUP_BY_LABELS: dict[str, str] = {
    "day": "Daily",
    "week": "Weekly",
    "month": "Monthly",
}


def format_period_label(dt: date, group_by: GroupBy) -> str:
    if group_by == "day":
        return dt.strftime("%d %b %Y")
    if group_by == "week":
        end = dt + timedelta(days=6)
        return f"{dt.strftime('%d %b')} – {end.strftime('%d %b %Y')}"
    return dt.strftime("%B %Y")


def _zero_bucket(
    *,
    group_by: GroupBy,
    period_start: date,
    period_end: date,
) -> list[dict]:
    """One labeled zero row when the filter is a single bucket with no dispenses."""
    label: str | None = None
    if group_by == "day" and period_start == period_end:
        label = format_period_label(period_start, "day")
    elif group_by == "week":
        days = (period_end - period_start).days
        if days == 6 and period_start.weekday() == 0:
            label = format_period_label(period_start, "week")
    elif group_by == "month":
        if period_start.year == period_end.year and period_start.month == period_end.month:
            label = format_period_label(period_start.replace(day=1), "month")

    if not label:
        return []
    return [{"sn": 1, "period_label": label, "total": 0, "percentage": 0.0}]


def build_prescription_period_breakdown(
    prescriptions_qs: QuerySet,
    *,
    group_by: GroupBy = "month",
    period_start: date | None = None,
    period_end: date | None = None,
) -> list[dict]:
    """Aggregate fully dispensed prescription orders by day, week, or month."""
    if group_by == "day":
        trunc = TruncDay("dispensed_at")
    elif group_by == "week":
        trunc = TruncWeek("dispensed_at")
    else:
        trunc = TruncMonth("dispensed_at")

    rows = (
        prescriptions_qs.annotate(bucket=trunc)
        .values("bucket")
        .annotate(total=Count("id"))
        .order_by("bucket")
    )

    data = []
    for idx, row in enumerate(rows, start=1):
        bucket = row["bucket"]
        if bucket is None:
            continue
        period_date = bucket.date() if hasattr(bucket, "date") else bucket
        count = row["total"] or 0
        data.append(
            {
                "sn": idx,
                "period_label": format_period_label(period_date, group_by),
                "total": count,
            }
        )

    total = sum(r["total"] for r in data)
    for row in data:
        row["percentage"] = round((row["total"] / total * 100) if total > 0 else 0, 1)

    if not data and period_start and period_end:
        return _zero_bucket(
            group_by=group_by, period_start=period_start, period_end=period_end
        )

    return data
