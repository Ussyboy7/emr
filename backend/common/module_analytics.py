"""
Shared helpers for module-level analytics (lab, radiology, pharmacy).
"""
from __future__ import annotations

from datetime import datetime, time
from typing import Any

from django.utils import timezone
from rest_framework.response import Response


def parse_analytics_dates(request) -> tuple[datetime, datetime] | Response:
    """
    Parse start/end query params as YYYY-MM-DD (inclusive end-of-day).
    Returns Response with 400 on error.
    """
    start_s = request.query_params.get("start")
    end_s = request.query_params.get("end")
    if not start_s or not end_s:
        return Response(
            {"error": "Query parameters 'start' and 'end' are required (YYYY-MM-DD)."},
            status=400,
        )
    try:
        start_d = datetime.strptime(start_s.strip(), "%Y-%m-%d").date()
        end_d = datetime.strptime(end_s.strip(), "%Y-%m-%d").date()
    except ValueError:
        return Response({"error": "Invalid date format. Use YYYY-MM-DD."}, status=400)

    if end_d < start_d:
        return Response({"error": "end must be on or after start."}, status=400)

    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(start_d, time.min), tz)
    end_dt = timezone.make_aware(datetime.combine(end_d, time.max), tz)
    return start_dt, end_dt


def patient_category_breakdown(patients_qs) -> dict[str, int]:
    """Count patients by category (employee, retiree, dependent, nonnpa)."""
    from django.db.models import Count

    rows = patients_qs.values("category").annotate(c=Count("id"))
    out = {"employee": 0, "retiree": 0, "dependent": 0, "nonnpa": 0, "other": 0}
    for row in rows:
        cat = (row["category"] or "").strip() or "other"
        if cat in out:
            out[cat] = row["c"]
        else:
            out["other"] += row["c"]
    return out


def patient_gender_breakdown(patients_qs) -> dict[str, int]:
    from django.db.models import Count

    rows = patients_qs.values("gender").annotate(c=Count("id"))
    out: dict[str, int] = {"male": 0, "female": 0, "unknown": 0}
    for row in rows:
        g = (row["gender"] or "").strip().lower()
        if g == "male":
            out["male"] = row["c"]
        elif g == "female":
            out["female"] = row["c"]
        else:
            out["unknown"] += row["c"]
    return out


def npa_staff_vs_non_npa(category_counts: dict[str, int]) -> dict[str, int]:
    """Staff-linked (employee, retiree, dependent) vs Non-NPA patients."""
    staff = (
        category_counts.get("employee", 0)
        + category_counts.get("retiree", 0)
        + category_counts.get("dependent", 0)
    )
    non_npa = category_counts.get("nonnpa", 0)
    return {"npa_staff_linked": staff, "non_npa": non_npa}
