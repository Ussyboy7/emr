from __future__ import annotations

# Nursing requisition catalog: IV fluids, injectables, wound materials, supplies.
# Docker: docker compose -f docker-compose.local.yml exec backend python manage.py seed_nursing_requisition_catalog
# Then:  docker compose -f docker-compose.local.yml exec backend python manage.py seed_full_inventory --locations Store

from django.core.management.base import BaseCommand

from pharmacy.models import Medication


def _row(
    name: str,
    generic_name: str,
    code: str,
    *,
    unit: str = "piece",
    strength: str = "",
    form: str = "supply",
    category: str = "Other",
    pack_size: int | None = None,
):
    """pack_size required when unit is bottle and form is solution (DB check constraint)."""
    d = {
        "name": name,
        "generic_name": generic_name,
        "code": code,
        "unit": unit,
        "strength": strength,
        "form": form,
        "category": category,
    }
    if pack_size is not None:
        d["pack_size"] = pack_size
    return d


class Command(BaseCommand):
    help = "Seed Nursing requisition catalog items (fluids, injectables, wound care, supplies)."

    def handle(self, *args, **options):
        rows = []

        # (a) FLUIDS — IVFluids
        rows += [
            _row("Normal Saline 0.9% (IV)", "Sodium chloride 0.9%", "NR-IV-NS", unit="ml", strength="0.9%", form="infusion", category="IVFluids"),
            _row("Ringers Lactate / Hartmann Solution (IV)", "Compound sodium lactate", "NR-IV-RL", unit="ml", strength="as labeled", form="infusion", category="IVFluids"),
            _row("Half Strength Darrows (IV)", "Half-strength Darrow's", "NR-IV-DAR-H", unit="ml", form="infusion", category="IVFluids"),
            _row("Full Strength Darrows (IV)", "Full-strength Darrow's", "NR-IV-DAR-F", unit="ml", form="infusion", category="IVFluids"),
            _row("5% Dextrose Saline (IV)", "Dextrose 5% in saline", "NR-IV-D5NS", unit="ml", form="infusion", category="IVFluids"),
            _row("10% Dextrose Saline (IV)", "Dextrose 10% in saline", "NR-IV-D10NS", unit="ml", form="infusion", category="IVFluids"),
            _row("50% Glucose (IV)", "Glucose 50%", "NR-IV-D50W", unit="ml", form="infusion", category="IVFluids"),
            _row("4.3% Dextrose Saline (IV)", "Dextrose 4.3% in saline", "NR-IV-D43NS", unit="ml", form="infusion", category="IVFluids"),
            _row("Dextrose in Water (IV)", "Dextrose in water", "NR-IV-DW", unit="ml", strength="5% or 10%", form="infusion", category="IVFluids"),
            _row("Paracetamol Infusion", "Paracetamol", "NR-IV-PCM-INF", unit="ml", form="infusion", category="Analgesics"),
            _row("Metronidazole (Flagyl) Infusion", "Metronidazole", "NR-IV-FLAGYL", unit="ml", form="infusion", category="Antibiotics"),
            _row("Ciprofloxacin Infusion", "Ciprofloxacin", "NR-IV-CIPRO-INF", unit="ml", form="infusion", category="Antibiotics"),
            _row("IV Fluid — Other (specify)", "Other IV fluid", "NR-IV-OTHER", unit="ml", form="infusion", category="IVFluids"),
        ]

        # (b) INJECTABLE
        rows += [
            _row("Pentazocine Injection", "Pentazocine", "NR-INJ-PENT", unit="ampoule", form="injection", category="Analgesics"),
            _row("Diazepam Injection", "Diazepam", "NR-INJ-DZP", unit="ampoule", form="injection", category="Anxiolytics"),
            _row("Chlorpromazine (CPZ) Injection", "Chlorpromazine", "NR-INJ-CPZ", unit="ampoule", form="injection", category="Antipsychotics"),
            _row("Tramadol Injection", "Tramadol", "NR-INJ-TRAM", unit="ampoule", form="injection", category="Analgesics"),
            _row("Adrenaline (Epinephrine) Injection", "Epinephrine", "NR-INJ-ADR", unit="ampoule", form="injection", category="Emergency"),
            _row("Aminophylline Injection", "Aminophylline", "NR-INJ-AMINO", unit="ampoule", form="injection", category="AntiAsthmatics"),
            _row("Labetalol Injection", "Labetalol", "NR-INJ-LAB", unit="ampoule", form="injection", category="Antihypertensives"),
            _row("Hydralazine Injection", "Hydralazine", "NR-INJ-HYD", unit="ampoule", form="injection", category="Antihypertensives"),
            _row("Insulin Injection (vial)", "Insulin", "NR-INJ-INS", unit="vial", form="injection", category="Antidiabetics"),
            _row("Hyoscine Butylbromide (Buscopan) Injection", "Hyoscine butylbromide", "NR-INJ-BUSC", unit="ampoule", form="injection", category="Antispasmodics"),
            _row("Paracetamol Injection", "Paracetamol", "NR-INJ-PCM", unit="ampoule", form="injection", category="Analgesics"),
            _row("Metoclopramide (Plasil) Injection", "Metoclopramide", "NR-INJ-PLAS", unit="ampoule", form="injection", category="Antiemetics"),
            _row("Promethazine Injection", "Promethazine", "NR-INJ-PROM", unit="ampoule", form="injection", category="Antihistamines"),
            _row("Rabeprazole Injection", "Rabeprazole", "NR-INJ-RAB", unit="vial", form="injection", category="AntiUlcer"),
            _row("Omeprazole Injection", "Omeprazole", "NR-INJ-OME", unit="vial", form="injection", category="AntiUlcer"),
            _row("Artemether Injection", "Artemether", "NR-INJ-ARTM", unit="ampoule", form="injection", category="Antimalarials"),
            _row("Artesunate Injection", "Artesunate", "NR-INJ-ARTS", unit="ampoule", form="injection", category="Antimalarials"),
            _row("Furosemide (Lasix) Injection", "Furosemide", "NR-INJ-LAS", unit="ampoule", form="injection", category="Diuretics"),
            _row("Diclofenac Injection", "Diclofenac", "NR-INJ-DIC", unit="ampoule", form="injection", category="NSAIDs"),
            _row("Ceftriaxone Injection 1g", "Ceftriaxone", "NR-INJ-CEF1G", unit="vial", strength="1g", form="injection", category="Antibiotics"),
            _row("Ceftriaxone (Rocephin) Injection 1g", "Ceftriaxone", "NR-INJ-ROCEF", unit="vial", strength="1g", form="injection", category="Antibiotics"),
            _row("Amoxicillin-Clavulanate (Augmentin) Injection", "Amoxicillin-clavulanate", "NR-INJ-AUG", unit="vial", form="injection", category="Antibiotics"),
            _row("Hydrocortisone Injection", "Hydrocortisone", "NR-INJ-HC", unit="vial", form="injection", category="Corticosteroids"),
            _row("Injectable — Other (specify)", "Other injectable", "NR-INJ-OTHER", unit="ampoule", form="injection", category="Other"),
        ]

        # (c) WOUND DRESSING MATERIALS
        rows += [
            _row("Eusol Solution", "Eusol", "NR-WC-EUSOL", unit="bottle", form="solution", category="Antiseptics", pack_size=100),
            _row("Hydrogen Peroxide Solution", "Hydrogen peroxide", "NR-WC-H2O2", unit="bottle", form="solution", category="Antiseptics", pack_size=100),
            _row("Iodine Solution", "Povidone-iodine", "NR-WC-IOD", unit="bottle", form="solution", category="Antiseptics", pack_size=100),
            _row("Damazine Cream", "Damazine", "NR-WC-DAMAZ", unit="tube", form="cream", category="Dermatological", pack_size=1),
            _row("Supratulle Dressing", "Supratulle", "NR-WC-SUPRA", unit="piece", form="dressing", category="WoundCare"),
            _row("Crêpe Bandage", "Crepe bandage", "NR-WC-CREPE", unit="roll", form="bandage", category="WoundCare"),
            _row("Plaster (adhesive)", "Zinc oxide / adhesive plaster", "NR-WC-PLAST", unit="roll", form="dressing", category="WoundCare"),
            _row("Wound dressing material — Other", "Other dressing", "NR-WC-OTHER", unit="piece", form="dressing", category="WoundCare"),
        ]

        # (d) OTHER SUPPLIES — variants as separate SKUs
        for colour in ("Blue", "Yellow", "Pink", "Green", "Ash"):
            code_suffix = colour[:4].upper() if colour != "Ash" else "ASH"
            rows.append(
                _row(
                    f"Urinary Catheter — {colour}",
                    "Urinary catheter",
                    f"NR-SUP-CATH-{code_suffix}",
                    unit="piece",
                    form="catheter",
                    category="Urological",
                )
            )
        rows += [
            _row("Urine Bag (drainage)", "Urine collection bag", "NR-SUP-UBAG", unit="piece", category="Urological"),
            _row("K-Y Jelly (sterile lubricant)", "Water-based lubricant", "NR-SUP-KY", unit="tube", form="gel", category="Obstetric", pack_size=1),
            _row("Surgical Gloves (pair)", "Sterile gloves", "NR-SUP-GLV", unit="pair", category="Other"),
            _row("Tongue Depressor (wooden)", "Tongue blade", "NR-SUP-TDEP", unit="piece", category="Other"),
            _row("Insulin Needles", "Insulin pen/needle", "NR-SUP-INSN", unit="piece", category="Other"),
            _row("IV Cannula", "Peripheral cannula", "NR-SUP-CANN", unit="piece", category="Other"),
            _row("IV Plaster / dressing", "IV site dressing", "NR-SUP-IVP", unit="piece", category="WoundCare"),
        ]
        for ml in ("2ml", "5ml", "10ml", "20ml"):
            rows.append(
                _row(
                    f"Syringe — {ml}",
                    "Disposable syringe",
                    f"NR-SUP-SYR-{ml.replace('ml', '')}",
                    unit="piece",
                    form="syringe",
                    category="Other",
                )
            )
        for gauge in ("21G", "23G"):
            rows.append(
                _row(
                    f"Hypodermic Needle — {gauge}",
                    "Hypodermic needle",
                    f"NR-SUP-NDL-{gauge.replace('G', '')}",
                    unit="piece",
                    form="needle",
                    category="Other",
                )
            )
        rows.append(
            _row("Medical supplies — Other (specify)", "Other supply", "NR-SUP-OTHER", unit="piece", category="Other")
        )

        created_count = 0
        updated_count = 0

        for med_data in rows:
            defaults = {
                "name": med_data["name"],
                "generic_name": med_data["generic_name"],
                "unit": med_data["unit"],
                "strength": med_data.get("strength") or "",
                "form": med_data["form"],
                "category": med_data.get("category") or "Other",
                "is_active": True,
            }
            if "pack_size" in med_data:
                defaults["pack_size"] = med_data["pack_size"]
            medication, created = Medication.objects.update_or_create(
                code=med_data["code"],
                defaults=defaults,
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"Created: {medication.code} — {medication.name}"))
            else:
                updated_count += 1
                self.stdout.write(self.style.WARNING(f"Updated: {medication.code} — {medication.name}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"\n✓ Nursing requisition catalog seed complete.\n"
                f"  Created: {created_count} | Updated: {updated_count} | Total rows: {len(rows)}\n"
                f"  Next: python manage.py seed_full_inventory --locations Store\n"
            )
        )
