"""Shared django-filter helpers for completed clinical session lists."""

from __future__ import annotations

from django.db.models import Q


def filter_nonempty_order_diagnosis(queryset, value: bool):
    if not value:
        return queryset
    return queryset.exclude(order__diagnosis="").filter(order__diagnosis__isnull=False)


def filter_nonempty_findings(queryset, value: bool, *, field_name: str = "findings"):
    if not value:
        return queryset
    return queryset.exclude(**{field_name: ""}).filter(**{f"{field_name}__isnull": False})


def filter_session_search(queryset, term: str, *, extra_q: Q | None = None):
    q = Q(order__patient__first_name__icontains=term) | Q(
        order__patient__surname__icontains=term
    ) | Q(order__patient__middle_name__icontains=term) | Q(
        order__patient__patient_id__icontains=term
    ) | Q(order__diagnosis__icontains=term)
    if extra_q is not None:
        q |= extra_q
    return queryset.filter(q)
