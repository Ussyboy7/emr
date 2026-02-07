from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from pharmacy.models import Medication, MedicationInventory

class Command(BaseCommand):
    help = "Transfer inventory from Store to Dispensary for initial seeding"

    def add_arguments(self, parser):
        parser.add_argument("--per-med-qty", type=int, default=50)
        parser.add_argument("--limit", type=int, default=50)

    def handle(self, *args, **options):
        per_med_qty = max(1, int(options.get("per_med_qty", 50)))
        limit = int(options.get("limit", 50))
        today = timezone.now().date()

        meds = (
            Medication.objects.filter(inventory_items__location="Store", inventory_items__quantity__gt=0)
            .distinct()
            .order_by("name")
        )

        if limit and limit > 0:
            meds = meds[:limit]

        moved_total = 0
        lines = 0

        with transaction.atomic():
            for med in meds:
                source_inv = (
                    MedicationInventory.objects.filter(
                        medication=med,
                        location="Store",
                        quantity__gt=0,
                        expiry_date__gt=today,
                    )
                    .order_by("expiry_date")
                )

                qty_to_move = per_med_qty

                for inv_item in source_inv:
                    if qty_to_move <= 0:
                        break
                    transfer_qty = min(inv_item.quantity, qty_to_move)

                    inv_item.quantity -= transfer_qty
                    inv_item.save()

                    dest_inv, created = MedicationInventory.objects.get_or_create(
                        medication=med,
                        batch_number=inv_item.batch_number,
                        location="Dispensary",
                        defaults={
                            "expiry_date": inv_item.expiry_date,
                            "quantity": 0,
                            "min_stock_level": inv_item.min_stock_level,
                            "unit": inv_item.unit,
                            "supplier": inv_item.supplier,
                        },
                    )
                    dest_inv.quantity += transfer_qty
                    if dest_inv.min_stock_level == 0 and inv_item.min_stock_level:
                        dest_inv.min_stock_level = inv_item.min_stock_level
                    dest_inv.save()

                    qty_to_move -= transfer_qty
                    moved_total += transfer_qty
                    lines += 1

        self.stdout.write(f"Moved total quantity: {int(moved_total)} across {lines} transfer lines for {meds.count()} medications")
