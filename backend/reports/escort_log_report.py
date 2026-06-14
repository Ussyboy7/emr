"""Escort log — patients accompanied to external facilities."""
from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q
from django.utils import timezone

from wards.models import AdmissionEscort

TRANSPORT_LABELS = dict(AdmissionEscort.TRANSPORT_CHOICES)

OUTCOME_LABELS = {
    "answered": "Answered",
    "voicemail": "Voicemail / no answer",
    "handover_in_person": "Handover in person",
}

# Frontend legacy alias
OUTCOME_FILTER_ALIASES = {
    "in_person": "handover_in_person",
}


def _pct(count: int, total: int) -> float:
    return round((count / total * 100) if total > 0 else 0, 1)


def _normalize_outcome_filter(value: str) -> str:
    key = (value or "").strip().lower()
    return OUTCOME_FILTER_ALIASES.get(key, key)


def _escorts_in_period(period_start: date, period_end: date):
    return AdmissionEscort.objects.select_related(
        "admission",
        "admission__patient",
        "admission__ward",
        "referral",
        "facility",
        "primary_nurse",
        "arrival_confirmed_by",
        "created_by",
    ).prefetch_related("additional_nurses").filter(
        Q(
            departure_at__date__gte=period_start,
            departure_at__date__lte=period_end,
        )
        | Q(
            departure_at__isnull=True,
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        )
    )


def build_escort_log_report(
    period_start: date,
    period_end: date,
    *,
    status_filter: str = "",
    outcome_filter: str = "",
) -> dict:
    escorts = _escorts_in_period(period_start, period_end)

    status_key = (status_filter or "").strip().lower()
    if status_key == "pending":
        escorts = escorts.filter(arrival_confirmed_at__isnull=True)
    elif status_key == "confirmed":
        escorts = escorts.filter(arrival_confirmed_at__isnull=False)

    outcome_key = _normalize_outcome_filter(outcome_filter)
    if outcome_key:
        escorts = escorts.filter(arrival_call_outcome=outcome_key)

    escorts = escorts.order_by("-departure_at", "-created_at")

    total = escorts.count()
    confirmed = escorts.filter(arrival_confirmed_at__isnull=False).count()
    pending = total - confirmed

    cutoff = timezone.now() - timedelta(hours=24)
    overdue = escorts.filter(
        arrival_confirmed_at__isnull=True,
        departure_at__isnull=False,
        departure_at__lte=cutoff,
    ).count()

    distinct_patients = (
        escorts.filter(admission__patient__isnull=False)
        .values("admission__patient")
        .distinct()
        .count()
    )

    avg_minutes_to_arrival = None
    confirmed_with_times = escorts.filter(
        arrival_confirmed_at__isnull=False,
        departure_at__isnull=False,
    )
    if confirmed_with_times.exists():
        agg = confirmed_with_times.aggregate(
            avg_duration=Avg(
                ExpressionWrapper(
                    F("arrival_confirmed_at") - F("departure_at"),
                    output_field=DurationField(),
                )
            )
        )
        avg_delta = agg.get("avg_duration")
        if avg_delta is not None:
            minutes = avg_delta.total_seconds() / 60.0
            if minutes >= 0:
                avg_minutes_to_arrival = round(minutes, 1)

    outcome_breakdown = []
    confirmed_for_outcomes = escorts.filter(arrival_call_outcome__gt="")
    outcome_total = confirmed_for_outcomes.count()
    for outcome, label in OUTCOME_LABELS.items():
        count = confirmed_for_outcomes.filter(arrival_call_outcome=outcome).count()
        if count > 0:
            outcome_breakdown.append(
                {
                    "key": outcome,
                    "label": label,
                    "count": count,
                    "percentage": _pct(count, outcome_total),
                }
            )
    unspecified = confirmed_for_outcomes.exclude(
        arrival_call_outcome__in=OUTCOME_LABELS.keys()
    ).count()
    if unspecified > 0:
        outcome_breakdown.append(
            {
                "key": "unspecified",
                "label": "Unspecified",
                "count": unspecified,
                "percentage": _pct(unspecified, outcome_total),
            }
        )

    facility_breakdown = []
    facility_rows = (
        escorts.values("facility_name_snapshot")
        .annotate(count=Count("id"))
        .order_by("-count", "facility_name_snapshot")[:15]
    )
    for row in facility_rows:
        name = (row["facility_name_snapshot"] or "").strip() or "Unspecified"
        count = row["count"]
        facility_breakdown.append(
            {
                "facility": name,
                "count": count,
                "percentage": _pct(count, total),
            }
        )

    top_facilities = [
        {"facility": row["facility"], "count": row["count"]} for row in facility_breakdown[:10]
    ]

    rows = []
    for idx, esc in enumerate(escorts[:200], 1):
        adm = esc.admission
        patient = adm.patient if adm else None
        primary_name = esc.primary_nurse.get_full_name() if esc.primary_nurse_id else ""
        additional_names = ", ".join(n.get_full_name() for n in esc.additional_nurses.all())
        transport_key = esc.transport_mode or ""
        outcome = esc.arrival_call_outcome or ""
        rows.append(
            {
                "sn": idx,
                "escort_id": esc.id,
                "patient_id": getattr(patient, "patient_id", "") if patient else "",
                "patient_name": patient.get_full_name() if patient else "",
                "admission_id": adm.admission_id if adm else "",
                "ward": adm.ward.name if adm and adm.ward_id else "",
                "departure_at": esc.departure_at.isoformat() if esc.departure_at else None,
                "facility": esc.facility_name_snapshot
                or (esc.facility.name if esc.facility_id else ""),
                "transport_mode": transport_key,
                "transport_label": TRANSPORT_LABELS.get(transport_key, transport_key.replace("_", " ").title()),
                "primary_nurse": primary_name,
                "additional_nurses": additional_names,
                "referral_id": esc.referral.referral_id if esc.referral_id else "",
                "referral_status": esc.referral.status if esc.referral_id else "",
                "urgency": esc.referral.urgency if esc.referral_id else "",
                "handover_summary": esc.handover_summary or "",
                "arrival_confirmed_at": (
                    esc.arrival_confirmed_at.isoformat() if esc.arrival_confirmed_at else None
                ),
                "arrival_outcome": outcome,
                "arrival_outcome_label": OUTCOME_LABELS.get(outcome, outcome.replace("_", " ").title() if outcome else ""),
                "arrival_notes": esc.arrival_notes or "",
                "arrival_confirmed_by": (
                    esc.arrival_confirmed_by.get_full_name() if esc.arrival_confirmed_by_id else ""
                ),
            }
        )

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "summary": {
            "total_escorts": total,
            "distinct_patients": distinct_patients,
            "pending_arrival": pending,
            "arrival_confirmed": confirmed,
            "overdue_pending": overdue,
            "avg_minutes_to_arrival": avg_minutes_to_arrival,
            "total": total,
            "pending": pending,
            "confirmed": confirmed,
            "outcome_counts": {
                row["key"]: row["count"] for row in outcome_breakdown if row["key"] != "unspecified"
            },
        },
        "outcome_breakdown": outcome_breakdown,
        "facility_breakdown": facility_breakdown,
        "top_facilities": top_facilities,
        "data": rows,
    }
