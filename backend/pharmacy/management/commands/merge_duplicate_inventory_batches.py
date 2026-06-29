"""
Merge duplicate MedicationInventory rows that share medication, location, batch number, and expiry.
Keeps the row with the most stock (then earliest received/created) and sums quantities.
"""
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from audit.services import AuditService
from pharmacy.models import (
    Dispense,
    HodStockIssue,
    MedicationInventory,
    StockIssueLine,
)


def _repoint_inventory_references(from_inv: MedicationInventory, to_inv: MedicationInventory) -> None:
    StockIssueLine.objects.filter(source_inventory_item=from_inv).update(
        source_inventory_item=to_inv
    )
    StockIssueLine.objects.filter(destination_inventory_item=from_inv).update(
        destination_inventory_item=to_inv
    )
    Dispense.objects.filter(inventory_item=from_inv).update(inventory_item=to_inv)
    HodStockIssue.objects.filter(inventory_item=from_inv).update(inventory_item=to_inv)


class Command(BaseCommand):
    help = "Merge duplicate store/HOD inventory batches with the same batch number and expiry."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report duplicates without merging.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        groups: dict[tuple, list[MedicationInventory]] = defaultdict(list)

        for inv in MedicationInventory.objects.select_related("medication").order_by("id"):
            key = (
                inv.medication_id,
                (inv.location or "").strip().lower(),
                (inv.batch_number or "").strip().lower(),
            )
            if not key[2]:
                continue
            groups[key].append(inv)

        merged_groups = 0
        removed_rows = 0

        for (_med_id, _location, _batch), rows in groups.items():
            by_expiry: dict = defaultdict(list)
            for row in rows:
                by_expiry[row.expiry_date].append(row)

            for _expiry, expiry_rows in by_expiry.items():
                if len(expiry_rows) < 2:
                    continue

                keeper = sorted(
                    expiry_rows,
                    key=lambda r: (
                        -float(r.quantity or 0),
                        r.received_at or r.created_at,
                        r.id,
                    ),
                )[0]
                extras = [r for r in expiry_rows if r.id != keeper.id]

                if dry_run:
                    self.stdout.write(
                        f"Would merge {len(extras)} row(s) into {keeper.id} "
                        f"({keeper.medication.name} / {keeper.batch_number} @ {keeper.location})"
                    )
                    merged_groups += 1
                    removed_rows += len(extras)
                    continue

                with transaction.atomic():
                    qty_before = Decimal(str(keeper.quantity or 0))
                    merged_ids: list[int] = []
                    total = qty_before
                    for extra in extras:
                        total += Decimal(str(extra.quantity or 0))
                        merged_ids.append(extra.id)
                        _repoint_inventory_references(extra, keeper)
                        extra.delete()
                        removed_rows += 1
                    keeper.quantity = total
                    keeper.save(update_fields=["quantity", "updated_at"])
                    AuditService.log_activity(
                        user=None,
                        action="update",
                        object_type="medication_inventory",
                        object_id=str(keeper.id),
                        module="pharmacy",
                        object_repr=(
                            f"Inventory {keeper.batch_number} - {keeper.medication.name}"
                        ),
                        description=(
                            f"Merged {len(merged_ids)} duplicate batch row(s) "
                            f"into {keeper.batch_number}."
                        ),
                        old_values={"quantity": float(qty_before)},
                        new_values={"quantity": float(total)},
                        metadata={
                            "stock_event": "duplicate_merge",
                            "duplicate_batch_merge": True,
                            "merged_inventory_ids": merged_ids,
                            "quantity_unit": keeper.unit or "units",
                            "adjustment_notes": (
                                f"Combined {len(merged_ids)} duplicate row(s) "
                                "with the same batch number and expiry."
                            ),
                        },
                    )
                    merged_groups += 1

        action = "Would merge" if dry_run else "Merged"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} {merged_groups} duplicate batch group(s); "
                f"{removed_rows} extra row(s) {'found' if dry_run else 'removed'}."
            )
        )
