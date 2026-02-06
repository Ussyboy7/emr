"""
Backfill MedicationInventory.min_stock_level from Medication.min_stock_level when missing (0).
Run with: python manage.py backfill_inventory_min_stock_level [--location Store|Dispensary] [--dry-run]
"""
from django.core.management.base import BaseCommand
from django.db.models import DecimalField, ExpressionWrapper, F
from pharmacy.models import MedicationInventory


class Command(BaseCommand):
    help = "Backfill inventory min_stock_level from medication min_stock_level where inventory min is 0"

    def add_arguments(self, parser):
        parser.add_argument(
            "--location",
            type=str,
            default="",
            help="Optional inventory location to scope the backfill (e.g., Store, Dispensary)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show how many rows would be updated without writing changes",
        )

    def handle(self, *args, **options):
        location = (options.get("location") or "").strip()
        dry_run = bool(options.get("dry_run"))

        qs = MedicationInventory.objects.filter(min_stock_level=0).select_related("medication")
        if location:
            qs = qs.filter(location=location)

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("No inventory rows require backfill."))
            return

        self.stdout.write(f"Inventory rows requiring backfill: {total}")
        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run: no changes applied."))
            return

        updated = qs.update(
            min_stock_level=ExpressionWrapper(
                F("medication__min_stock_level"),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            )
        )
        self.stdout.write(self.style.SUCCESS(f"Updated rows: {updated}"))

