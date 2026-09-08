"""Soft dispense lock for prescriptions (claim / heartbeat / release)."""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

# Heartbeat expected every ~60s from the open modal; miss a few → lock expires.
DISPENSE_LOCK_TTL = timedelta(minutes=3)
# Legacy ``dispensing`` rows with no live claim should not block the queue forever.
ABANDONED_DISPENSING_TTL = timedelta(minutes=30)


def _user_display(user) -> str:
    if not user:
        return "Another pharmacist"
    full = (getattr(user, "get_full_name", lambda: "")() or "").strip()
    return full or getattr(user, "username", None) or "Another pharmacist"


def lock_is_active(prescription, *, now=None) -> bool:
    """True when a claim is still within the heartbeat TTL."""
    now = now or timezone.now()
    if not getattr(prescription, "dispensing_by_id", None):
        return False
    heartbeat = getattr(prescription, "dispensing_lock_heartbeat_at", None) or getattr(
        prescription, "dispensing_started_at", None
    )
    if heartbeat is None:
        return False
    return heartbeat >= now - DISPENSE_LOCK_TTL


def lock_info(prescription, *, request_user=None) -> dict:
    """Serializer-friendly lock payload."""
    active = lock_is_active(prescription)
    holder = getattr(prescription, "dispensing_by", None) if active else None
    mine = bool(
        active
        and request_user
        and getattr(request_user, "is_authenticated", False)
        and holder
        and holder.pk == request_user.pk
    )
    return {
        "locked": active,
        "locked_by_me": mine,
        "locked_by_id": holder.pk if holder else None,
        "locked_by_name": _user_display(holder) if holder else None,
        "lock_heartbeat_at": (
            prescription.dispensing_lock_heartbeat_at.isoformat()
            if active and getattr(prescription, "dispensing_lock_heartbeat_at", None)
            else None
        ),
    }


def _idle_status_after_release(prescription) -> str:
    """Status when releasing a claim with no further work in progress."""
    items = list(
        prescription.medications.model.objects.filter(prescription_id=prescription.pk)
    )
    active = [i for i in items if not getattr(i, "superseded_at", None)]
    if not active:
        return "pending"
    any_qty = any(float(i.dispensed_quantity or 0) > 0 for i in active)
    all_done = all(
        float(i.dispensed_quantity or 0) >= float(i.quantity or 0) for i in active
    )
    if all_done:
        return "dispensed"
    if any_qty:
        return "partially_dispensed"
    return "pending"


def sweep_stale_dispense_locks() -> dict:
    """
    Bulk cleanup for list/stats: drop expired claims and revert abandoned Processing.
    """
    from pharmacy.models import Prescription, PrescriptionItem

    now = timezone.now()
    lock_cutoff = now - DISPENSE_LOCK_TTL
    abandon_cutoff = now - ABANDONED_DISPENSING_TTL

    cleared_locks = Prescription.objects.filter(dispensing_by__isnull=False).filter(
        Q(dispensing_lock_heartbeat_at__lt=lock_cutoff)
        | Q(
            dispensing_lock_heartbeat_at__isnull=True,
            dispensing_started_at__lt=lock_cutoff,
        )
        | Q(
            dispensing_lock_heartbeat_at__isnull=True,
            dispensing_started_at__isnull=True,
            prescribed_at__lt=lock_cutoff,
        )
    ).update(dispensing_by=None, dispensing_lock_heartbeat_at=None)

    candidates = list(
        Prescription.objects.filter(
            status="dispensing",
            dispensing_by__isnull=True,
        )
        .filter(
            Q(dispensing_started_at__lt=abandon_cutoff)
            | Q(
                dispensing_started_at__isnull=True,
                prescribed_at__lt=abandon_cutoff,
            )
        )
        .values_list("id", flat=True)[:3000]
    )
    if not candidates:
        return {"cleared_locks": cleared_locks, "reverted_pending": 0, "reverted_partial": 0}

    dispensed_totals = {
        row["prescription_id"]: float(row["total"] or 0)
        for row in PrescriptionItem.objects.filter(prescription_id__in=candidates)
        .values("prescription_id")
        .annotate(total=Sum("dispensed_quantity"))
    }
    pending_ids = [pk for pk in candidates if dispensed_totals.get(pk, 0) <= 0]
    partial_ids = [pk for pk in candidates if dispensed_totals.get(pk, 0) > 0]

    reverted_pending = 0
    if pending_ids:
        reverted_pending = Prescription.objects.filter(id__in=pending_ids).update(
            status="pending",
            dispensing_started_at=None,
            dispensing_by=None,
            dispensing_lock_heartbeat_at=None,
        )

    reverted_partial = 0
    if partial_ids:
        reverted_partial = Prescription.objects.filter(id__in=partial_ids).update(
            status="partially_dispensed",
            dispensing_by=None,
            dispensing_lock_heartbeat_at=None,
        )

    return {
        "cleared_locks": cleared_locks,
        "reverted_pending": reverted_pending,
        "reverted_partial": reverted_partial,
    }


class DispenseLockConflict(Exception):
    def __init__(self, prescription, holder):
        self.prescription = prescription
        self.holder = holder
        super().__init__(
            f"{_user_display(holder)} is already dispensing this prescription."
        )


@transaction.atomic
def claim_dispense_lock(prescription, user):
    """Claim exclusive dispense rights. Raises DispenseLockConflict if held by another."""
    from pharmacy.models import Prescription

    sweep_stale_dispense_locks()
    rx = (
        Prescription.objects.select_for_update(of=("self",))
        .select_related("dispensing_by")
        .get(pk=prescription.pk)
    )
    now = timezone.now()

    if rx.status in ("dispensed", "cancelled"):
        raise ValueError(f"Cannot dispense a {rx.status} prescription.")

    if lock_is_active(rx, now=now) and rx.dispensing_by_id != user.pk:
        raise DispenseLockConflict(rx, rx.dispensing_by)

    rx.dispensing_by = user
    rx.dispensing_lock_heartbeat_at = now
    if rx.status == "pending":
        rx.status = "dispensing"
    if not rx.dispensing_started_at:
        rx.dispensing_started_at = now
    rx.save(
        update_fields=[
            "dispensing_by",
            "dispensing_lock_heartbeat_at",
            "status",
            "dispensing_started_at",
        ]
    )
    return rx


@transaction.atomic
def heartbeat_dispense_lock(prescription, user):
    from pharmacy.models import Prescription

    rx = (
        Prescription.objects.select_for_update(of=("self",))
        .select_related("dispensing_by")
        .get(pk=prescription.pk)
    )
    if rx.dispensing_by_id != user.pk or not lock_is_active(rx):
        raise DispenseLockConflict(rx, rx.dispensing_by)
    rx.dispensing_lock_heartbeat_at = timezone.now()
    rx.save(update_fields=["dispensing_lock_heartbeat_at"])
    return rx


@transaction.atomic
def release_dispense_lock(prescription, user, *, force: bool = False):
    """Release claim. Reverts to pending/partial when appropriate."""
    from pharmacy.models import Prescription

    rx = (
        Prescription.objects.select_for_update(of=("self",))
        .select_related("dispensing_by")
        .get(pk=prescription.pk)
    )
    if not force and rx.dispensing_by_id and rx.dispensing_by_id != user.pk:
        raise DispenseLockConflict(rx, rx.dispensing_by)

    rx.dispensing_by = None
    rx.dispensing_lock_heartbeat_at = None
    if rx.status == "dispensing":
        idle = _idle_status_after_release(rx)
        rx.status = idle
        if idle == "pending":
            rx.dispensing_started_at = None
        elif idle == "dispensed" and not rx.dispensed_at:
            rx.dispensed_at = timezone.now()
    rx.save(
        update_fields=[
            "dispensing_by",
            "dispensing_lock_heartbeat_at",
            "status",
            "dispensing_started_at",
            "dispensed_at",
        ]
    )
    return rx


def find_mergeable_prescription(
    *,
    patient_id,
    visit_id=None,
    consultation_session_id=None,
    admission_id=None,
):
    """Open pending RX for the same clinical context (append instead of new RX)."""
    from pharmacy.models import Prescription

    qs = Prescription.objects.filter(patient_id=patient_id, status="pending").filter(
        dispensing_by__isnull=True
    )
    if visit_id:
        qs = qs.filter(visit_id=visit_id)
    elif admission_id:
        qs = qs.filter(admission_id=admission_id)
    else:
        return None
    if consultation_session_id:
        session_match = (
            qs.filter(consultation_session_id=consultation_session_id)
            .order_by("-prescribed_at")
            .first()
        )
        if session_match:
            return session_match
    return qs.order_by("-prescribed_at").first()
