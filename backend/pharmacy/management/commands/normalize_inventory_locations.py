from django.core.management.base import BaseCommand
from pharmacy.models import MedicationInventory


class Command(BaseCommand):
    help = "Normalize MedicationInventory.location values (e.g., seeded rows -> Store)"

    def add_arguments(self, parser):
        parser.add_argument("--from", dest="from_location", type=str, required=True)
        parser.add_argument("--to", dest="to_location", type=str, required=True)
        parser.add_argument("--batch-prefix", dest="batch_prefix", type=str, default="")
        parser.add_argument("--supplier", dest="supplier", type=str, default="")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        from_location = (options.get("from_location") or "").strip()
        to_location = (options.get("to_location") or "").strip()
        batch_prefix = (options.get("batch_prefix") or "").strip()
        supplier = (options.get("supplier") or "").strip()
        dry_run = bool(options.get("dry_run"))

        qs = MedicationInventory.objects.filter(location=from_location)
        if batch_prefix:
            qs = qs.filter(batch_number__startswith=batch_prefix)
        if supplier:
            qs = qs.filter(supplier=supplier)

        count = qs.count()
        self.stdout.write(f"Matching inventory rows: {count}")
        if count == 0:
            return
        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run: no changes applied."))
            return

        updated = qs.update(location=to_location)
        self.stdout.write(self.style.SUCCESS(f"Updated rows: {updated}"))

