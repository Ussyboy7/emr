"""
Normalize Medication.unit to canonical values the drug-master frontend expects (lowercase).
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from pharmacy.models import Medication

ALLOWED = ("tablet", "capsule", "ml", "vial", "box", "pack")
UNIT_MAP = {
    "tablet": "tablet",
    "capsule": "capsule",
    "ml": "ml",
    "vial": "vial",
    "box": "box",
    "pack": "pack",
    "bottle": "pack",
    "bottles": "pack",
    "tube": "box",
    "tubes": "box",
}


class Command(BaseCommand):
    help = "Normalize Medication.unit to tablet, capsule, ml, vial, box, pack (lowercase)."

    def handle(self, *args, **options):
        updated = 0
        with transaction.atomic():
            for med in Medication.objects.only("id", "unit").iterator():
                raw = (med.unit or "").strip().lower()
                if not raw:
                    continue
                canonical = UNIT_MAP.get(raw, raw if raw in ALLOWED else "tablet")
                if med.unit != canonical:
                    med.unit = canonical
                    med.save(update_fields=["unit"])
                    updated += 1
        self.stdout.write(self.style.SUCCESS(f"Normalized unit for {updated} medication(s)."))
