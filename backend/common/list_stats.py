"""Aggregate list tab counts in a single query (avoids N parallel COUNT requests)."""

from __future__ import annotations

from django.db.models import Count, Q, QuerySet


def aggregate_status_counts(
    queryset: QuerySet,
    field: str,
    buckets: dict[str, str],
) -> dict[str, int]:
    """
    Count rows per status value in one DB round-trip.

    ``buckets`` maps response keys to ORM field values, e.g.
    ``{'scheduled': 'scheduled', 'inProgress': 'in_progress'}``.
    """
    aggregates = {
        f"bucket_{key}": Count("pk", filter=Q(**{field: value}))
        for key, value in buckets.items()
    }
    row = queryset.aggregate(total=Count("pk"), **aggregates)
    return {
        "total": row["total"] or 0,
        **{key: row[f"bucket_{key}"] or 0 for key in buckets},
    }


def viewset_queryset_excluding_params(viewset, exclude: frozenset[str]) -> QuerySet:
    """Apply list filters while omitting query params (e.g. ``status`` for tab counts)."""
    django_request = viewset.request._request
    original_get = django_request.GET
    filtered = original_get.copy()
    for key in exclude:
        filtered.pop(key, None)
    filtered.pop("page", None)
    filtered.pop("page_size", None)
    django_request.GET = filtered
    try:
        return viewset.filter_queryset(viewset.get_queryset())
    finally:
        django_request.GET = original_get
