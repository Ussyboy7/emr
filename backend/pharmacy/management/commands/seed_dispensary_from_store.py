from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from pharmacy.models import (
    Medication,
    MedicationInventory,
    StockRequest,
    StockRequestItem,
    StockIssue,
    StockIssueLine,
    DispensaryReceiptLine,
)

User = get_user_model()


class Command(BaseCommand):
    help = "Transfer inventory from Store to Dispensary via Central Store flow (StockRequest -> DispensaryReceiptLine)"

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

        seed_user = User.objects.filter(is_active=True).first()
        moved_total = 0
        lines = 0

        with transaction.atomic():
            req = StockRequest.objects.create(
                status="fulfilled",
                from_location="Store",
                to_location="Dispensary",
                requested_by=seed_user,
                notes="Seeded from Central Store (seed_dispensary_from_store)",
            )
            issue = StockIssue.objects.create(
                request=req,
                issued_by=seed_user,
                notes=f"Seeded request {req.request_id}",
            )

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
                fulfilled_for_med = 0

                for inv_item in source_inv:
                    if qty_to_move <= 0:
                        break
                    transfer_qty = min(inv_item.quantity, qty_to_move)

                    inv_item.quantity -= transfer_qty
                    inv_item.save(update_fields=["quantity"])

                    issue_line = StockIssueLine.objects.create(
                        issue=issue,
                        medication=med,
                        source_inventory_item=inv_item,
                        destination_inventory_item=None,
                        quantity=transfer_qty,
                    )
                    DispensaryReceiptLine.objects.create(
                        medication=med,
                        quantity=transfer_qty,
                        quantity_remaining=transfer_qty,
                        received_at=issue.issued_at,
                        request=req,
                        issue=issue,
                        stock_issue_line=issue_line,
                        location_clinic=getattr(req, "clinic", None),
                        batch_number=inv_item.batch_number or "",
                        expiry_date=inv_item.expiry_date,
                    )

                    qty_to_move -= transfer_qty
                    fulfilled_for_med += transfer_qty
                    moved_total += transfer_qty
                    lines += 1

                if fulfilled_for_med > 0:
                    StockRequestItem.objects.create(
                        request=req,
                        medication=med,
                        quantity=fulfilled_for_med,
                        fulfilled_quantity=fulfilled_for_med,
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f"Moved {int(moved_total)} units to Dispensary via Central Store (request {req.request_id}), {lines} receipt lines"
            )
        )
