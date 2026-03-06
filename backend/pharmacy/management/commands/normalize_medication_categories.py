"""
Normalize Medication.category to valid CATEGORY_CHOICES.
Fixes values that were stored from generic/CSV (e.g. 'GI (Antacid)') so they match the model choices (e.g. 'Antacids').
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from pharmacy.models import Medication

CATEGORY_NORMALIZE = {
    "GI (Antacid)": "Antacids",
    "Antihypertensive (CCB)": "Antihypertensives",
    "Antihypertensive (Beta Blocker)": "Antihypertensives",
    "Lipid Lowering (Statin)": "LipidLowering",
    "Antibiotic (Macrolide)": "Antibiotics",
    "Diuretic (Thiazide)": "Diuretics",
    "Topical Combination": "Dermatological",
    "Corticosteroid/Antibiotic": "Corticosteroids",
    "Antiglaucoma": "AntiGlaucoma",
    "Anticancer (Antiandrogen)": "Cytotoxic",
}


class Command(BaseCommand):
    help = "Normalize Medication.category to valid choices (e.g. GI (Antacid) -> Antacids)."

    def handle(self, *args, **options):
        valid = {c[0] for c in Medication.CATEGORY_CHOICES}
        updated = 0
        with transaction.atomic():
            for med in Medication.objects.only("id", "category").iterator():
                cat = (med.category or "").strip()
                if not cat:
                    continue
                normalized = CATEGORY_NORMALIZE.get(cat, cat)
                if normalized not in valid:
                    normalized = "Other"
                if med.category != normalized:
                    med.category = normalized
                    med.save(update_fields=["category"])
                    updated += 1
        self.stdout.write(self.style.SUCCESS(f"Normalized category for {updated} medication(s)."))
