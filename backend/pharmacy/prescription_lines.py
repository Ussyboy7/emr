"""Helpers for prescription line lifecycle (supersede duplicates, etc.)."""
from __future__ import annotations

from django.db.models import F
from django.utils import timezone


def supersede_redundant_generic_siblings(prescription_id: int, source_item_id: int) -> int:
    """
    When a line for generic G is fully dispensed, supersede other active lines on the
    same prescription for the same generic that were never dispensed (duplicate Rx rows).
    """
    from pharmacy.models import PrescriptionItem

    source = PrescriptionItem.objects.filter(pk=source_item_id).first()
    if source is None:
        return 0
    if source.dispensed_quantity < source.quantity:
        return 0

    generic_id = source.generic_id
    if not generic_id:
        return 0

    now = timezone.now()
    return (
        PrescriptionItem.objects.filter(
            prescription_id=prescription_id,
            generic_id=generic_id,
            superseded_at__isnull=True,
            dispensed_quantity=0,
        )
        .exclude(pk=source_item_id)
        .update(superseded_at=now)
    )


def repair_all_redundant_generic_siblings() -> int:
    """One-shot repair for legacy duplicate generic lines (fully dispensed sibling exists)."""
    from pharmacy.models import Prescription, PrescriptionItem

    repaired_prescription_ids: set[int] = set()
    total = 0
    for item in (
        PrescriptionItem.objects.filter(
            superseded_at__isnull=True,
            dispensed_quantity__gte=F("quantity"),
        )
        .iterator(chunk_size=500)
    ):
        count = supersede_redundant_generic_siblings(item.prescription_id, item.id)
        if count:
            total += count
            repaired_prescription_ids.add(item.prescription_id)

    for prescription_id in repaired_prescription_ids:
        prescription = Prescription.objects.filter(pk=prescription_id).first()
        if prescription:
            prescription.recalculate_status()

    return total
