"""Shared procedure queryset filters — keep nursing history and MR reports aligned."""
from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Q, QuerySet
from django.utils import timezone

from .models import Procedure

# Procedure types counted under each Procedures History bucket.
INJECTION_TYPES = ("injection",)
DRESSING_TYPES = ("dressing", "wound_care")
OBSERVATION_TYPES = ("ward_admission",)
MEDICATION_TYPES = ("medication", "other", "catheterization", "iv_insertion")
NON_MEDICATION_TYPES = INJECTION_TYPES + DRESSING_TYPES + OBSERVATION_TYPES


def base_procedures_queryset() -> QuerySet:
    return Procedure.objects.select_related("patient")


def filter_procedures_by_history_type(qs: QuerySet, history_type: str) -> QuerySet:
    """Mirror ``ProcedureViewSet`` history_type filtering."""
    ht = (history_type or "all").strip().lower()
    if ht == "all":
        return qs
    if ht == "injection":
        return qs.filter(procedure_type__in=INJECTION_TYPES)
    if ht == "dressing":
        return qs.filter(procedure_type__in=DRESSING_TYPES)
    if ht == "ward_admission":
        return qs.filter(procedure_type__in=OBSERVATION_TYPES)
    if ht == "medication":
        return qs.exclude(procedure_type__in=NON_MEDICATION_TYPES)
    return qs


def filter_procedures_by_performed_period(
    qs: QuerySet,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> QuerySet:
    """Inclusive calendar-date filter on ``performed_at`` (server timezone)."""
    if start_date and end_date:
        return qs.filter(
            performed_at__date__gte=start_date,
            performed_at__date__lte=end_date,
        )
    if start_date:
        return qs.filter(performed_at__date__gte=start_date)
    if end_date:
        return qs.filter(performed_at__date__lte=end_date)
    return qs


def filter_procedures_by_date_preset(qs: QuerySet, preset: str) -> QuerySet:
    """Date presets for nursing procedure history (calendar month, not rolling 31 days)."""
    df = (preset or "").strip().lower()
    if not df or df == "all":
        return qs

    today = timezone.localdate()
    if df == "today":
        return qs.filter(performed_at__date=today)
    if df == "week":
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        return qs.filter(performed_at__date__gte=week_start, performed_at__date__lte=week_end)
    if df == "month":
        month_start = today.replace(day=1)
        return qs.filter(performed_at__date__gte=month_start, performed_at__date__lte=today)
    return qs


def gender_event_counts(qs: QuerySet, gender: str) -> int:
    return qs.filter(patient__gender=gender).count()


def distinct_patient_gender_counts(*querysets: QuerySet) -> tuple[int, int]:
    male_ids: set[int] = set()
    female_ids: set[int] = set()
    for qs in querysets:
        for patient_id, patient_gender in qs.values_list("patient_id", "patient__gender"):
            if patient_gender == "male":
                male_ids.add(patient_id)
            elif patient_gender == "female":
                female_ids.add(patient_id)
    return len(male_ids), len(female_ids)
