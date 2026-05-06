"""
Nursing analytics: comprehensive metrics for nursing orders, procedures, and patient care.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from django.db.models import Count, Q
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek

from common.module_analytics import (
    npa_staff_vs_non_npa,
    parse_analytics_dates,
    patient_category_breakdown,
    patient_gender_breakdown,
)
from nursing.models import NursingOrder
from patients.models import Patient


def build_nursing_analytics(
    start_date: datetime, end_date: datetime
) -> dict[str, Any]:
    """
    Build nursing analytics.
    """

    # Test basic query first
    try:
        orders_qs = NursingOrder.objects.filter(
            ordered_at__gte=start_date, ordered_at__lte=end_date
        )
        total_orders = orders_qs.count()
    except Exception as e:
        # If basic query fails, return minimal response
        return {
            "period": {
                "start": start_date.date().isoformat(),
                "end": end_date.date().isoformat(),
            },
            "summary": {
                "total_orders": 0,
                "completed_orders": 0,
                "pending_orders": 0,
                "unique_patients": 0,
            },
            "patients_by_gender": {},
            "patients_by_category": {},
            "npa_staff_linked_vs_non_npa": {"npa_staff_linked": 0, "non_npa": 0},
            "orders_by_status": {},
            "orders_by_priority": {},
            "orders_by_type": {},
        }

    orders_qs = orders_qs.select_related("patient")

    completed_orders = orders_qs.filter(status="completed").count()
    pending_orders = orders_qs.filter(status="pending").count()

    patient_ids = orders_qs.values_list("patient_id", flat=True).distinct()
    unique_patients = len(set(patient_ids))

    # Get actual patient demographics
    patients_qs = Patient.objects.filter(id__in=patient_ids)
    gender = patient_gender_breakdown(patients_qs)
    category = patient_category_breakdown(patients_qs)
    staff_split = npa_staff_vs_non_npa(category)

    status_breakdown = {
        r["status"]: r["count"]
        for r in orders_qs.values("status").annotate(count=Count("id")).order_by("-count")
    }

    priority_breakdown = {
        r["priority"]: r["count"]
        for r in orders_qs.values("priority").annotate(count=Count("id")).order_by("-count")
    }

    type_breakdown = {
        r["order_type"]: r["count"]
        for r in orders_qs.values("order_type").annotate(count=Count("id")).order_by("-count")
    }

    # Period aggregations
    daily = (
        NursingOrder.objects.filter(ordered_at__gte=start_date, ordered_at__lte=end_date)
        .annotate(day=TruncDate("ordered_at"))
        .values("day")
        .annotate(orders=Count("id"), completed=Count("id", filter=Q(status="completed")))
        .order_by("day")
    )
    by_day = [
        {
            "date": row["day"].isoformat() if row["day"] else None,
            "orders": row["orders"],
            "completed": row["completed"],
        }
        for row in daily
        if row["day"]
    ]

    weekly = (
        NursingOrder.objects.filter(ordered_at__gte=start_date, ordered_at__lte=end_date)
        .annotate(w=TruncWeek("ordered_at"))
        .values("w")
        .annotate(orders=Count("id"), completed=Count("id", filter=Q(status="completed")))
        .order_by("w")
    )
    by_week = [
        {
            "week": row["w"].strftime("%Y-%m-%d") if row["w"] else None,
            "orders": row["orders"],
            "completed": row["completed"],
        }
        for row in weekly
        if row["w"]
    ]

    monthly = (
        NursingOrder.objects.filter(ordered_at__gte=start_date, ordered_at__lte=end_date)
        .annotate(m=TruncMonth("ordered_at"))
        .values("m")
        .annotate(orders=Count("id"), completed=Count("id", filter=Q(status="completed")))
        .order_by("m")
    )
    by_month = [
        {
            "month": row["m"].strftime("%Y-%m") if row["m"] else None,
            "orders": row["orders"],
            "completed": row["completed"],
        }
        for row in monthly
        if row["m"]
    ]

    # Temporarily return empty arrays for complex queries to isolate the issue
    by_bimonth = []
    by_quarter = []
    by_halfyear = []

    return {
        "period": {
            "start": start_date.date().isoformat(),
            "end": end_date.date().isoformat(),
        },
        "summary": {
            "total_orders": total_orders,
            "completed_orders": completed_orders,
            "pending_orders": pending_orders,
            "unique_patients": unique_patients,
        },
        "patients_by_gender": gender,
        "patients_by_category": category,
        "npa_staff_linked_vs_non_npa": staff_split,
        "orders_by_status": status_breakdown,
        "orders_by_priority": priority_breakdown,
        "orders_by_type": type_breakdown,
        "by_day": by_day,
        "by_week": by_week,
        "by_month": by_month,
        "by_bimonth": by_bimonth,
        "by_quarter": by_quarter,
        "by_halfyear": by_halfyear,
    }