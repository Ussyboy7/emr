from django.core.management.base import BaseCommand
from django.db import transaction

from pharmacy.models import Medication

# Map generic/CSV category values to Medication.CATEGORY_CHOICES so we never store invalid values.
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
    help = "Set Medication.category from generic when brand category is empty; normalizes to valid choices (e.g. GI (Antacid) -> Antacids)."

    def handle(self, *args, **options):
        valid_choices = {c[0] for c in Medication.CATEGORY_CHOICES}
        updated = 0
        qs = Medication.objects.filter(generic__isnull=False).select_related("generic")
        with transaction.atomic():
            for med in qs:
                if not (med.category or "").strip():
                    generic_cat = (getattr(med.generic, "category", None) or "").strip()
                    if generic_cat:
                        normalized = CATEGORY_NORMALIZE.get(generic_cat, generic_cat)
                        if normalized not in valid_choices:
                            normalized = "Other"
                        med.category = normalized
                        med.save(update_fields=["category"])
                        updated += 1
        self.stdout.write(self.style.SUCCESS(f"Backfilled category from generic for {updated} medication(s)."))
