from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from pharmacy.models import Medication, MedicationInventory


class Command(BaseCommand):
    help = "Seed Store and Dispensary inventory for all active medications"

    def add_arguments(self, parser):
        parser.add_argument(
            "--quantity",
            type=int,
            default=10000,
        )
        parser.add_argument(
            "--min-stock",
            type=int,
            default=100,
        )
        parser.add_argument(
            "--locations",
            type=str,
            default="Store,Dispensary",
        )
        parser.add_argument(
            "--expiry-days",
            type=int,
            default=730,
        )

    @transaction.atomic
    def handle(self, *args, **options):
        default_quantity = Decimal(options["quantity"])
        default_min_stock = Decimal(options["min_stock"])
        expiry_days = int(options["expiry_days"])
        expiry_date = (timezone.now() + timedelta(days=expiry_days)).date()

        locations = [loc.strip() for loc in (options["locations"] or "").split(",") if loc.strip()]
        if not locations:
            self.stdout.write(self.style.ERROR("No locations provided. Example: --locations Store,Dispensary"))
            return

        # Dispensary is receipt-based; do not create MedicationInventory for it
        if "Dispensary" in locations:
            locations = [loc for loc in locations if loc != "Dispensary"]
            self.stdout.write(
                self.style.WARNING("Dispensary is receipt-based. Skipping Dispensary here. Use seed_demo_data or seed_dispensary_from_store to seed from Central Store.")
            )
        if not locations:
            return

        medications = Medication.objects.filter(is_active=True).only("id", "name", "code", "unit")
        if not medications.exists():
            self.stdout.write(self.style.WARNING("No active medications found. Run seed_medications first."))
            return

        created_count = 0
        updated_count = 0

        for medication in medications:
            batch_number = f"BATCH-{medication.code}-001"
            unit = medication.unit or "tablet"

            for location in locations:
                _, created = MedicationInventory.objects.update_or_create(
                    medication=medication,
                    batch_number=batch_number,
                    location=location,
                    defaults={
                        "expiry_date": expiry_date,
                        "quantity": default_quantity,
                        "unit": unit,
                        "min_stock_level": default_min_stock,
                        "supplier": (medication.manufacturer or "").strip(),
                    },
                )
                if created:
                    created_count += 1
                else:
                    updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"✓ Full inventory seeding complete | locations={','.join(locations)} "
                f"| created={created_count} | updated={updated_count} | medications={medications.count()}"
            )
        )
