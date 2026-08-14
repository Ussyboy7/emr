"""Consolidate orders that were split across multiple sample batches.

One Lab ID per order: a later collection must reuse the order's first
accession instead of minting a fresh serial. Orders already split into
several batches (before the reuse fix) are merged onto the earliest batch.

Default is a non-writing dry run; --apply persists the merge.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from laboratory.models import LabSampleBatch, LabTest


class Command(BaseCommand):
    help = "Consolidate split sample batches onto the order's earliest batch."

    def add_arguments(self, parser):
        modes = parser.add_mutually_exclusive_group()
        modes.add_argument(
            "--dry-run",
            action="store_true",
            help="Report changes without writing them (the default).",
        )
        modes.add_argument(
            "--apply",
            action="store_true",
            help="Persist the consolidation.",
        )

    def handle(self, *args, **options):
        apply_mode = options["apply"]
        merged = 0
        orders = 0
        details = []

        split_orders = (
            LabSampleBatch.objects.values("order_id")
            .annotate(batch_count=Count("id"))
            .filter(batch_count__gt=1)
            .values_list("order_id", flat=True)
            .distinct()
            .order_by("order_id")
        )

        for order_id in split_orders:
            batches = list(
                LabSampleBatch.objects.filter(order_id=order_id)
                .order_by("collected_at", "id")
            )
            if len(batches) < 2:
                continue
            keep = batches[0]
            discard = batches[1:]
            orders += 1
            merged += len(discard)
            if apply_mode:
                with transaction.atomic():
                    for batch in discard:
                        LabTest.objects.filter(sample_batch=batch).update(
                            sample_batch=keep
                        )
                    # Normalize lab_number on every test of the order to the kept accession.
                    LabTest.objects.filter(order_id=order_id).exclude(
                        lab_number=keep.accession_number
                    ).update(lab_number=keep.accession_number)
                    LabSampleBatch.objects.filter(id__in=[b.pk for b in discard]).delete()
            details.append(
                f"  order {order_id}: keep {keep.accession_number} (batch {keep.pk}), "
                f"merge {[b.accession_number for b in discard]}"
            )

        mode = "APPLY" if apply_mode else "DRY RUN"
        self.stdout.write(f"{mode} consolidate_order_batches")
        self.stdout.write(f"orders consolidated: {orders}, batches merged: {merged}")
        for detail in details:
            self.stdout.write(detail)