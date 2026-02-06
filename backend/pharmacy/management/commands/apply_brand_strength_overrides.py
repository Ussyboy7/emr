from django.core.management.base import BaseCommand, CommandError
import csv
import os
from pharmacy.models import Medication

class Command(BaseCommand):
    help = "Apply brand strength overrides from CSV (Product_Code,Brand_Name,Strength,Form)"

    def add_arguments(self, parser):
        parser.add_argument("--csv", type=str, required=True, help="Path to BRAND_STRENGTH_OVERRIDES.csv")

    def handle(self, *args, **options):
        path = os.path.abspath(options["csv"])
        if not os.path.exists(path):
            raise CommandError(f"CSV file not found: {path}")

        updated = 0
        skipped = 0

        with open(path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            required = ["Product_Code", "Brand_Name", "Strength"]
            for col in required:
                if col not in reader.fieldnames:
                    raise CommandError(f"CSV missing required column: {col}")

            for row in reader:
                code = (row.get("Product_Code") or "").strip()
                name = (row.get("Brand_Name") or "").strip()
                strength = (row.get("Strength") or "").strip()
                form = (row.get("Form") or "").strip()

                if not strength:
                    skipped += 1
                    continue

                qs = Medication.objects.all()
                if code:
                    qs = qs.filter(code=code)
                elif name:
                    qs = qs.filter(name__iexact=name)
                else:
                    skipped += 1
                    continue

                med = qs.first()
                if not med:
                    skipped += 1
                    continue

                med.strength = strength
                if form:
                    med.form = form
                med.save(update_fields=["strength", "form"] if form else ["strength"])
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Updated brands: {updated}, skipped: {skipped}"))
