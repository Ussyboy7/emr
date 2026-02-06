from django.core.management.base import BaseCommand, CommandError
import csv
import os
from pharmacy.models import GenericMedication

class Command(BaseCommand):
    help = "Apply generic strength overrides from CSV (Generic_Name,Strength,Dosage_Form,Route)"

    def add_arguments(self, parser):
        parser.add_argument("--csv", type=str, required=True, help="Path to GENERIC_STRENGTH_OVERRIDES.csv")

    def handle(self, *args, **options):
        path = os.path.abspath(options["csv"])
        if not os.path.exists(path):
            raise CommandError(f"CSV file not found: {path}")

        updated = 0
        skipped = 0

        with open(path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            required = ["Generic_Name", "Strength"]
            for col in required:
                if col not in reader.fieldnames:
                    raise CommandError(f"CSV missing required column: {col}")

            for row in reader:
                name = (row.get("Generic_Name") or "").strip()
                strength = (row.get("Strength") or "").strip()
                dosage_form = (row.get("Dosage_Form") or "").strip()
                route = (row.get("Route") or "").strip()

                if not name or not strength:
                    skipped += 1
                    continue

                gen = GenericMedication.objects.filter(name__iexact=name).first()
                if not gen:
                    skipped += 1
                    continue

                gen.strength = strength
                if dosage_form:
                    gen.dosage_form = dosage_form
                if route:
                    gen.route = route
                gen.save(update_fields=["strength", "dosage_form", "route"])
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Updated generics: {updated}, skipped: {skipped}"))
