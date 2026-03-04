from django.core.management.base import BaseCommand
from pharmacy.models import Medication

FORM_DEFAULTS = {
    "tablet": 10,
    "caplet": 10,
    "capsule": 10,
    "sr tablet": 10,
    "xl tablet": 10,
    "effervescent tablet": 10,
    "syrup": 100,
    "suspension": 100,
    "solution": 100,
    "gel": 1,
    "cream": 1,
    "ointment": 1,
    "eye drops": 10,
    "ear drops": 10,
    "eye/ear drops": 10,
    "lozenge": 10,
    "injection": 1,
    "vial": 1,
    "ampoule": 1,
    "pen": 1,
    "inhaler": 1,
    "diskus inhaler": 1,
    "powder": 1,
    "granules": 10,
    "ovules": 10,
    "unit": 10,
}

class Command(BaseCommand):
    help = "Set default pack_size for brands that are missing it, based on dosage form"

    def handle(self, *args, **options):
        updated = 0
        missing = Medication.objects.filter(pack_size__isnull=True)
        for med in missing:
            form = (med.form or "").strip().lower()
            pack = FORM_DEFAULTS.get(form, 10)
            med.pack_size = pack
            med.save(update_fields=["pack_size"])
            updated += 1
        self.stdout.write(self.style.SUCCESS(f"Updated pack_size for {updated} medications"))
