"""Shared completed-session stats (single aggregate query set)."""

from __future__ import annotations

from django.db.models import Count, Q, QuerySet


def aggregate_completed_session_stats(queryset: QuerySet, *, mode: str) -> dict:
    """
    Return total / with_diagnosis / urgent / fourth metric in one DB round-trip.

    ``mode`` is ``eye`` (with_findings) or ``physio`` (with_recommendations).
    """
    if mode == "physio":
        fourth_filter = ~Q(recommendations=[])
        urgent_filter = Q(order__priority__in=["urgent", "high"])
    else:
        fourth_filter = Q(findings__isnull=False) & ~Q(findings="")
        urgent_filter = Q(order__priority__in=["urgent", "stat", "emergency"])
    diagnosis_filter = Q(order__diagnosis__isnull=False) & ~Q(order__diagnosis="")

    row = queryset.aggregate(
        total=Count("id"),
        with_diagnosis=Count("id", filter=diagnosis_filter),
        urgent=Count("id", filter=urgent_filter),
        fourth=Count("id", filter=fourth_filter),
    )
    return {
        "total": row["total"] or 0,
        "withDiagnosis": row["with_diagnosis"] or 0,
        "urgent": row["urgent"] or 0,
        "withFindings": row["fourth"] or 0,
    }
