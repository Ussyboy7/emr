"""Referral volume and workflow tracking for MR reports."""
from __future__ import annotations

from datetime import date

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

# Legacy statuses stored on older rows
LEGACY_STATUS_MAP = {
    "sent": "submitted_to_records",
    "accepted": "records_review",
    "scheduled": "approved_for_forms",
    "completed": "closed",
}

NEW_STATUSES = ("draft", "submitted_to_records", "sent")
FOLLOW_UP_STATUSES = (
    "records_review",
    "returned_for_correction",
    "approved_for_forms",
    "accepted",
    "scheduled",
)
COMPLETED_STATUSES = ("closed", "completed")
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


def build_referral_tracking_report(period_start: date, period_end: date) -> dict:
    referrals = (
        Referral.objects.filter(
            referred_at__date__gte=period_start,
            referred_at__date__lte=period_end,
            patient__isnull=False,
        )
        .select_related("patient")
        .order_by("-referred_at")
    )

    total = referrals.count()
    distinct_patients = referrals.values("patient").distinct().count()
    active = referrals.exclude(status__in=CANCELLED_STATUSES)

    new_referrals = active.filter(status__in=NEW_STATUSES).count()
    follow_ups = active.filter(status__in=FOLLOW_UP_STATUSES).count()
    completed = active.filter(status__in=COMPLETED_STATUSES).count()
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
                "facility": referral.facility,
                "referred_at": referral.referred_at.isoformat() if referral.referred_at else None,
            }
        )

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "summary": {
            "total_referrals": total,
            "distinct_patients": distinct_patients,
            "new_referrals": new_referrals,
            "follow_ups": follow_ups,
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
