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


def _patient_name_id_q(patient_prefix: str, term: str) -> Q:
    """Prefer index-friendly exact / prefix matches before substring fallback."""
    q = Q(**{f"{patient_prefix}__patient_id__iexact": term})
    if len(term) >= 2:
        q |= (
            Q(**{f"{patient_prefix}__surname__istartswith": term})
            | Q(**{f"{patient_prefix}__first_name__istartswith": term})
            | Q(**{f"{patient_prefix}__middle_name__istartswith": term})
        )
    if len(term) >= 3:
        q |= (
            Q(**{f"{patient_prefix}__surname__icontains": term})
            | Q(**{f"{patient_prefix}__first_name__icontains": term})
            | Q(**{f"{patient_prefix}__middle_name__icontains": term})
            | Q(**{f"{patient_prefix}__patient_id__icontains": term})
        )
    return q


def filter_session_search(queryset, term: str, *, extra_q: Q | None = None):
    term = (term or "").strip()
    if not term:
        return queryset

    q = _patient_name_id_q("order__patient", term) | Q(order__diagnosis__icontains=term)

    if term.isdigit():
        q |= Q(pk=int(term)) | Q(order_id=int(term))

    if extra_q is not None:
        q |= extra_q

    return queryset.filter(q)


def filter_order_patient_search(queryset, term: str, *, extra_q: Q | None = None, id_q: Q | None = None):
    """Patient/diagnosis search for order querysets (direct patient FK)."""
    term = (term or "").strip()
    if not term:
        return queryset

    q = id_q or Q()
    q |= _patient_name_id_q("patient", term)
    if extra_q is not None:
        q |= extra_q
    return queryset.filter(q).distinct()
