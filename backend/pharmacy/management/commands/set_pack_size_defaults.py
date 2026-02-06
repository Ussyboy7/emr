from django.core.management.base import BaseCommand
from pharmacy.models import Medication

FORM_DEFAULTS = {
    "Tablet": 10,
    "Caplet": 10,
    "Capsule": 10,
    "SR Tablet": 10,
    "XL Tablet": 10,
    "Effervescent Tablet": 10,
    "Syrup": 1,
    "Suspension": 1,
    "Gel": 1,
    "Cream": 1,
    "Ointment": 1,
    "Eye Drops": 1,
    "Ear Drops": 1,
    "Eye/Ear Drops": 1,
    "Lozenge": 10,
    "Injection": 1,
    "Vial": 1,
    "Ampoule": 1,
    "Pen": 1,
    "Inhaler": 1,
    "Diskus Inhaler": 1,
    "Powder": 1,
    "Granules": 10,
    "Ovules": 10,
    "Unit": 10,
}

class Command(BaseCommand):
    help = "Set default pack_size for brands that are missing it, based on dosage form"

    def handle(self, *args, **options):
        updated = 0
        missing = Medication.objects.filter(pack_size__isnull=True)
        for med in missing:
            form = (med.form or "").strip()
            pack = FORM_DEFAULTS.get(form, 10)
            med.pack_size = pack
            med.save(update_fields=["pack_size"])
            updated += 1
        self.stdout.write(self.style.SUCCESS(f"Updated pack_size for {updated} medications"))
