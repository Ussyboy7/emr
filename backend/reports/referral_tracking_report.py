"""Referral volume and retainership hospital pivot for MR reports."""
from __future__ import annotations

from datetime import date

from django.db.models import Q

from consultation.models import Referral

STATUS_LABELS = {
    "draft": "Draft",
    "submitted_to_records": "Submitted to Records",
    "records_review": "Records Review",
    "returned_for_correction": "Returned for Correction",
    "approved_for_forms": "Records acknowledged",
    "closed": "Closed",
    "cancelled": "Cancelled",
}

FACILITY_TYPE_LABELS = {
    "internal": "Internal",
    "external": "External",
    "specialist": "Specialist",
}

LEGACY_STATUS_MAP = {
    "sent": "submitted_to_records",
    "accepted": "records_review",
    "scheduled": "approved_for_forms",
    "completed": "closed",
}

CANCELLED_STATUSES = ("cancelled",)


def _pct(count: int, total: int) -> float:
    return round((count / total * 100) if total > 0 else 0, 1)


def _canonical_status(status: str) -> str:
    return LEGACY_STATUS_MAP.get(status, status)


def _status_filter_keys(canonical: str) -> tuple[str, ...]:
    keys = [canonical]
    for legacy, mapped in LEGACY_STATUS_MAP.items():
        if mapped == canonical:
            keys.append(legacy)
    return tuple(keys)


def _facility_display_name(referral: Referral) -> str:
    if referral.facility_partner_id and referral.facility_partner:
        return referral.facility_partner.name
    return (referral.facility or "").strip() or "Unregistered facility"


def _is_new_referral(referral: Referral) -> bool:
    """First referral for patient + registered facility before this row's date."""
    if referral.patient_id is None:
        return True
    if referral.facility_partner_id:
        earlier = Referral.objects.filter(
            patient_id=referral.patient_id,
            facility_partner_id=referral.facility_partner_id,
            referred_at__lt=referral.referred_at,
        ).exclude(status__in=CANCELLED_STATUSES)
        return not earlier.exists()
    facility_name = (referral.facility or "").strip().lower()
    if not facility_name:
        return True
    earlier = (
        Referral.objects.filter(
            patient_id=referral.patient_id,
            referred_at__lt=referral.referred_at,
        )
        .exclude(status__in=CANCELLED_STATUSES)
        .filter(Q(facility__iexact=referral.facility) | Q(facility_partner__name__iexact=referral.facility))
    )
    return not earlier.exists()


def build_retainership_pivot(period_start: date, period_end: date) -> list[dict]:
    referrals = (
        Referral.objects.filter(
            referred_at__date__gte=period_start,
            referred_at__date__lte=period_end,
            patient__isnull=False,
        )
        .exclude(status__in=CANCELLED_STATUSES)
        .select_related("patient", "facility_partner")
        .order_by("referred_at")
    )

    pivot: dict[str, dict[str, int]] = {}
    for referral in referrals:
        name = _facility_display_name(referral)
        if name not in pivot:
            pivot[name] = {"new": 0, "follow_up": 0, "total": 0}
        if _is_new_referral(referral):
            pivot[name]["new"] += 1
        else:
            pivot[name]["follow_up"] += 1
        pivot[name]["total"] += 1

    rows = []
    for sn, (facility, counts) in enumerate(sorted(pivot.items(), key=lambda x: (-x[1]["total"], x[0])), start=1):
        rows.append(
            {
                "sn": sn,
                "facility": facility,
                "new": counts["new"],
                "follow_up": counts["follow_up"],
                "total": counts["total"],
            }
        )
    return rows


def build_referral_tracking_report(period_start: date, period_end: date) -> dict:
    referrals = (
        Referral.objects.filter(
            referred_at__date__gte=period_start,
            referred_at__date__lte=period_end,
            patient__isnull=False,
        )
        .select_related("patient", "facility_partner")
        .order_by("-referred_at")
    )

    total = referrals.count()
    distinct_patients = referrals.values("patient").distinct().count()
    active = referrals.exclude(status__in=CANCELLED_STATUSES)

    new_count = 0
    follow_up_count = 0
    for referral in active.iterator():
        if _is_new_referral(referral):
            new_count += 1
        else:
            follow_up_count += 1

    completed = active.filter(status__in=("closed", "completed")).count()
    cancelled = referrals.filter(status__in=CANCELLED_STATUSES).count()

    internal = referrals.filter(facility_type="internal").count()
    external = referrals.filter(facility_type="external").count()
    specialist = referrals.filter(facility_type="specialist").count()

    status_breakdown = []
    for status_key, label in STATUS_LABELS.items():
        count = referrals.filter(status__in=_status_filter_keys(status_key)).count()
        if count > 0:
            status_breakdown.append(
                {
                    "key": status_key,
                    "label": label,
                    "count": count,
                    "percentage": _pct(count, total),
                }
            )

    facility_breakdown = []
    for facility_key, label in FACILITY_TYPE_LABELS.items():
        count = referrals.filter(facility_type=facility_key).count()
        if count > 0:
            facility_breakdown.append(
                {
                    "key": facility_key,
                    "label": label,
                    "count": count,
                    "percentage": _pct(count, total),
                }
            )

    retainership = build_retainership_pivot(period_start, period_end)

    rows = []
    for referral in referrals[:500]:
        patient = referral.patient
        rows.append(
            {
                "referral_id": referral.referral_id,
                "patient__patient_id": patient.patient_id if patient else "",
                "patient__first_name": patient.first_name if patient else "",
                "patient__surname": patient.surname if patient else "",
                "patient_name": patient.get_full_name() if patient else "",
                "status": referral.status,
                "status_label": STATUS_LABELS.get(
                    _canonical_status(referral.status),
                    referral.status.replace("_", " ").title(),
                ),
                "facility_type": referral.facility_type,
                "facility_type_label": FACILITY_TYPE_LABELS.get(
                    referral.facility_type, referral.facility_type
                ),
                "specialty": referral.specialty,
                "facility": _facility_display_name(referral),
                "is_new": _is_new_referral(referral),
                "referred_at": referral.referred_at.isoformat() if referral.referred_at else None,
            }
        )

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "retainership": retainership,
        "summary": {
            "total_referrals": total,
            "distinct_patients": distinct_patients,
            "new_referrals": new_count,
            "follow_ups": follow_up_count,
            "completed": completed,
            "cancelled": cancelled,
            "internal": internal,
            "external": external,
            "specialist": specialist,
            "total": total,
        },
        "status_breakdown": status_breakdown,
        "facility_breakdown": facility_breakdown,
        "data": rows,
    }
