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


def first_option(value: str) -> str:
    raw = (value or "").strip()
    if not raw or raw in {"-", "N/A", "n/a"}:
        return ""
    return raw.replace(";", ",").split(",")[0].strip()


def infer_route(dosage_form: str) -> str:
    f = (dosage_form or "").strip().lower()
    if not f:
        return "Oral"
    if any(k in f for k in ["tablet", "capsule", "syrup", "suspension", "powder", "sachet", "solution"]):
        return "Oral"
    if any(k in f for k in ["injection", "vial", "ampoule", "infusion"]):
        return "IV"
    if any(k in f for k in ["inhaler", "nebul"]):
        return "Inhalation"
    if any(k in f for k in ["cream", "ointment", "gel", "lotion"]):
        return "Topical"
    if "eye" in f or "ophthalmic" in f:
        return "Ophthalmic"
    if "ear" in f or "otic" in f:
        return "Otic"
    if "nasal" in f:
        return "Nasal"
    if "suppository" in f:
        return "Rectal"
    return "Oral"


def resolve_generic_variant(generic_id: str, generic_name: str, strength: str, form: str, category: str):
    base_generic = None
    if generic_id:
        base_generic = GenericMedication.objects.filter(atc_code=generic_id).first()
    if not base_generic and generic_name:
        base_generic = GenericMedication.objects.filter(name__iexact=generic_name).order_by("id").first()

    name_final = (generic_name or (base_generic.name if base_generic else "")).strip()
    if not name_final:
        return None

    strength_final = first_option(strength) or first_option(base_generic.strength if base_generic else "") or "N/A"
    form_final = first_option(form) or first_option(base_generic.dosage_form if base_generic else "")
    if not form_final:
        return None
    route_final = first_option(base_generic.route if base_generic else "") or infer_route(form_final)

    exact = GenericMedication.objects.filter(
        name__iexact=name_final,
        strength=strength_final,
        dosage_form__iexact=form_final,
    ).order_by("id").first()
    if exact:
        return exact

    atc_for_create = None
    if generic_id and not GenericMedication.objects.filter(atc_code=generic_id).exists():
        atc_for_create = generic_id

    return GenericMedication.objects.create(
        name=name_final,
        active_ingredient=(base_generic.active_ingredient if base_generic else name_final),
        category=(base_generic.category if base_generic and base_generic.category else (category or "Other")),
        strength=strength_final,
        dosage_form=form_final,
        route=route_final,
        atc_code=atc_for_create,
        is_active=True,
    )

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
                strength = first_option(row.get("Strength") or "")
                form = first_option(row.get("Form") or "")
                unit = normalize_unit(first_option(row.get("Unit") or ""), form)
                category_raw = (row.get("Category") or "").strip()
                manufacturer = (row.get("Manufacturer") or "").strip()
                pack_size_raw = (row.get("Pack_Size") or "").strip()

                if not brand_name or not code:
                    skipped += 1
                    continue

                try:
                    pack_size = int(pack_size_raw) if pack_size_raw else None
                except ValueError:
                    pack_size = None

                category = CATEGORY_MAP.get(category_raw, category_raw)

                generic = resolve_generic_variant(
                    generic_id=generic_id,
                    generic_name=generic_name,
                    strength=strength,
                    form=form,
                    category=category,
                )
                if not generic:
                    skipped += 1
                    continue

                existing = Medication.objects.filter(name=brand_name, generic=generic).first()
                # Fallbacks from generic when missing
                strength_final = strength or first_option(generic.strength or "") or "N/A"
                form_final = form or first_option(generic.dosage_form or "")
                if not form_final:
                    skipped += 1
                    continue

                if existing:

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
