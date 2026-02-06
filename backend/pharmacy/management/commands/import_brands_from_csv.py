from django.core.management.base import BaseCommand, CommandError
from django.db import transaction, IntegrityError
import csv
import os
from pharmacy.models import GenericMedication, Medication

CATEGORY_MAP = {
    "Antibiotic": "Antibiotics",
    "Antimalarial": "Antimalarials",
    "NSAID": "NSAIDs",
    "Analgesic": "Analgesics",
    "Antiplatelet": "Antiplatelet",
    "Antigout": "Antigout",
    "Antidepressant": "Antidepressants",
    "Diuretic": "Diuretics",
    "Antihypertensive": "Antihypertensives",
    "Ophthalmic": "Ophthalmic",
    "Cough": "Antitussives",
    "Haematinics": "Haematinics",
    "Neuropathic": "Analgesics",
    "Device": "",
    "Supplements": "Vitamins",
    "PPI": "AntiUlcer",
    "Respiratory": "AntiAsthmatics",
    "Urology": "Urological",
    "Antidiabetic": "Antidiabetics",
    "DMARD": "Other",
    "Antihistamine": "Antihistamines",
    "Antifungal": "Antifungals",
    "Decongestant": "NasalDecongestants",
    "Topical Analgesic": "Analgesics",
    "Renal": "Other",
    "Combination": "Other",
    "Hypnotic": "Sedatives",
    "Antimigraine": "AntiMigraine",
    "Lipid": "LipidLowering",
    "Otic": "Otic",
    "Hepatoprotective": "Hepatoprotective",
}

def normalize_unit(unit: str, form: str) -> str:
    unit = (unit or "").strip()
    form = (form or "").strip()
    return unit or form or "unit"

class Command(BaseCommand):
    help = "Import brand medications from CSV and link them to generics"

    def add_arguments(self, parser):
        parser.add_argument("--csv", type=str, required=True, help="Path to BRAND_MEDICATIONS.csv")

    def handle(self, *args, **options):
        csv_path = options.get("csv")
        path = os.path.abspath(csv_path)
        if not os.path.exists(path):
            raise CommandError(f"CSV file not found: {path}")

        created = 0
        updated = 0
        skipped = 0

        self.stdout.write(self.style.WARNING("Starting brand import..."))

        with open(path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            required_cols = [
                "Brand_ID","Brand_Name","Generic_ID","Generic_Name","Product_Code",
                "Unit","Strength","Form","Category","Manufacturer","Pack_Size"
            ]
            for col in required_cols:
                if col not in reader.fieldnames:
                    raise CommandError(f"CSV missing required column: {col}")

            for row in reader:
                brand_name = (row.get("Brand_Name") or "").strip()
                generic_id = (row.get("Generic_ID") or "").strip()
                generic_name = (row.get("Generic_Name") or "").strip()
                code = (row.get("Product_Code") or "").strip()
                unit = normalize_unit(row.get("Unit") or "", row.get("Form") or "")
                strength = (row.get("Strength") or "").strip()
                form = (row.get("Form") or "").strip()
                category_raw = (row.get("Category") or "").strip()
                manufacturer = (row.get("Manufacturer") or "").strip()
                pack_size_raw = (row.get("Pack_Size") or "").strip()

                if not brand_name or not code:
                    skipped += 1
                    continue
                # Enforce required fields
                if not strength or strength == "-":
                    skipped += 1
                    continue
                if not form or form == "-":
                    skipped += 1
                    continue

                try:
                    pack_size = int(pack_size_raw) if pack_size_raw else None
                except ValueError:
                    pack_size = None

                category = CATEGORY_MAP.get(category_raw, "")

                generic = None
                if generic_id:
                    generic = GenericMedication.objects.filter(atc_code=generic_id).first()
                if not generic and generic_name:
                    generic = GenericMedication.objects.filter(name__iexact=generic_name).first()

                if not generic:
                    skipped += 1
                    continue

                existing = Medication.objects.filter(name=brand_name, generic=generic).first()
                if existing:
                    # Fallbacks from generic when missing
                    strength_final = strength or (generic.strength or "")
                    form_final = form or (generic.dosage_form or "")

                    existing.code = code
                    existing.unit = unit
                    existing.strength = strength_final
                    existing.form = form_final
                    existing.category = category
                    existing.manufacturer = manufacturer
                    existing.pack_size = pack_size
                    existing.is_active = True
                    existing.save()
                    updated += 1
                    continue

                try:
                    # Fallbacks from generic when missing
                    strength_final = strength or (generic.strength or "")
                    form_final = form or (generic.dosage_form or "")

                    Medication.objects.create(
                        name=brand_name,
                        generic=generic,
                        generic_name=generic.name,
                        code=code,
                        unit=unit,
                        strength=strength_final,
                        form=form_final,
                        category=category,
                        manufacturer=manufacturer,
                        pack_size=pack_size,
                        prescription_required=False,
                        min_stock_level=0,
                        is_active=True,
                    )
                    created += 1
                except IntegrityError:
                    try:
                        Medication.objects.create(
                            name=brand_name,
                            generic=generic,
                            generic_name=generic.name,
                            code=f"{code}-{generic.id}",
                            unit=unit,
                            strength=strength_final,
                            form=form_final,
                            category=category,
                            manufacturer=manufacturer,
                            pack_size=pack_size,
                            prescription_required=False,
                            min_stock_level=0,
                            is_active=True,
                        )
                        created += 1
                    except Exception:
                        skipped += 1

        total = Medication.objects.count()
        self.stdout.write(self.style.SUCCESS(f"Created {created}, updated {updated}, skipped {skipped}. Total brands: {total}"))
