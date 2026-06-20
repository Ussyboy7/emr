import csv
import hashlib
import os
from django.core.management.base import BaseCommand
from pharmacy.models import GenericMedication, Medication


def stable_generic_id(generic: GenericMedication) -> str:
    if generic.atc_code and str(generic.atc_code).strip():
        return str(generic.atc_code).strip()[:20]
    basis = "|".join(
        [
            (generic.name or "").strip().lower(),
            (generic.active_ingredient or "").strip().lower(),
            (generic.strength or "").strip().lower(),
            (generic.dosage_form or "").strip().lower(),
            (generic.route or "").strip().lower(),
        ]
    )
    digest = hashlib.sha1(basis.encode("utf-8"), usedforsecurity=False).hexdigest()[:12]
    return f"G{digest}"


class Command(BaseCommand):
    help = "Export pharmacy generics/brands to seed CSVs that re-import cleanly"

    def add_arguments(self, parser):
        parser.add_argument(
            "--out-dir",
            type=str,
            default="/app/data",
            help="Output directory for seed CSVs (default: /app/data)",
        )

    def handle(self, *args, **options):
        out_dir = os.path.abspath(options["out_dir"])
        os.makedirs(out_dir, exist_ok=True)

        generics_path = os.path.join(out_dir, "GENERIC_MEDICATIONS_SEED.csv")
        brands_path = os.path.join(out_dir, "BRAND_MEDICATIONS_SEED.csv")

        generics = GenericMedication.objects.all().order_by("name", "id")
        meds = Medication.objects.select_related("generic").all().order_by("name", "id")

        generic_id_map: dict[int, str] = {}
        for g in generics:
            generic_id_map[g.id] = stable_generic_id(g)

        with open(generics_path, "w", newline="", encoding="utf-8") as f:
            fieldnames = [
                "Generic_ID",
                "Generic_Name",
                "Active_Ingredient",
                "Category",
                "Strengths_Available",
                "Dosage_Forms",
                "Route",
            ]
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for g in generics:
                w.writerow(
                    {
                        "Generic_ID": generic_id_map[g.id],
                        "Generic_Name": (g.name or "").strip(),
                        "Active_Ingredient": (g.active_ingredient or "").strip(),
                        "Category": (g.category or "Other").strip() or "Other",
                        "Strengths_Available": (g.strength or "").strip(),
                        "Dosage_Forms": (g.dosage_form or "").strip(),
                        "Route": (g.route or "").strip(),
                    }
                )

        with open(brands_path, "w", newline="", encoding="utf-8") as f:
            fieldnames = [
                "Brand_ID",
                "Brand_Name",
                "Generic_ID",
                "Generic_Name",
                "Product_Code",
                "Unit",
                "Strength",
                "Form",
                "Category",
                "Manufacturer",
                "Pack_Size",
            ]
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for idx, m in enumerate(meds, start=1):
                g = m.generic
                if not g:
                    continue
                w.writerow(
                    {
                        "Brand_ID": str(idx),
                        "Brand_Name": (m.name or "").strip(),
                        "Generic_ID": generic_id_map.get(g.id, ""),
                        "Generic_Name": (g.name or "").strip(),
                        "Product_Code": (m.code or "").strip(),
                        "Unit": (m.unit or "").strip(),
                        "Strength": (m.strength or "").strip(),
                        "Form": (m.form or "").strip(),
                        "Category": (m.category or "").strip(),
                        "Manufacturer": (m.manufacturer or "").strip(),
                        "Pack_Size": str(m.pack_size) if m.pack_size is not None else "",
                    }
                )

        self.stdout.write(self.style.SUCCESS(f"Exported generics: {generics.count()} -> {generics_path}"))
        self.stdout.write(self.style.SUCCESS(f"Exported brands: {meds.count()} -> {brands_path}"))
