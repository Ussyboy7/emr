from django.core.management.base import BaseCommand
from django.db import transaction

from pharmacy.models import MedicationInventory


class Command(BaseCommand):
    help = (
        "Preview and optionally normalize inventory supplier values where supplier is "
        "'Default Supplier' by using medication manufacturer."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply updates. Without this flag, runs as dry-run preview only.",
        )
        parser.add_argument(
            "--sample-size",
            type=int,
            default=20,
            help="How many example rows to print in preview output (default: 20).",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options.get("apply"))
        sample_size = max(0, int(options.get("sample_size", 20)))

        candidates = (
            MedicationInventory.objects.filter(supplier__iexact="Default Supplier")
            .select_related("medication")
            .order_by("id")
        )

        total = candidates.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("No rows found with supplier='Default Supplier'."))
            return

        previews = []
        would_set_manufacturer = 0
        would_set_blank = 0

        for inv in candidates.iterator():
            manufacturer = (getattr(inv.medication, "manufacturer", "") or "").strip()
            target_supplier = manufacturer

            if target_supplier:
                would_set_manufacturer += 1
            else:
                would_set_blank += 1

            if len(previews) < sample_size:
                previews.append(
                    {
                        "id": inv.id,
                        "medication_name": getattr(inv.medication, "name", ""),
                        "batch_number": inv.batch_number,
                        "current_supplier": inv.supplier,
                        "new_supplier": target_supplier,
                    }
                )

        self.stdout.write("")
        self.stdout.write("Default supplier normalization preview")
        self.stdout.write("-" * 40)
        self.stdout.write(f"Total candidate rows: {total}")
        self.stdout.write(f"Rows changing to manufacturer: {would_set_manufacturer}")
        self.stdout.write(f"Rows changing to blank supplier: {would_set_blank}")
        self.stdout.write("")

        if previews:
            self.stdout.write(f"Sample rows (up to {sample_size}):")
            for row in previews:
                self.stdout.write(
                    f"  id={row['id']} | med={row['medication_name']} | batch={row['batch_number']} | "
                    f"'{row['current_supplier']}' -> '{row['new_supplier']}'"
                )
            self.stdout.write("")

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    "Dry run only. Re-run with --apply to execute updates."
                )
            )
            return

        updated = 0
        with transaction.atomic():
            for inv in candidates.iterator():
                manufacturer = (getattr(inv.medication, "manufacturer", "") or "").strip()
                inv.supplier = manufacturer
                inv.save(update_fields=["supplier"])
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Applied updates to {updated} rows."))
