from django.core.management.base import BaseCommand
from django.db import transaction
from pharmacy.models import Medication

class Command(BaseCommand):
    help = "Fill missing brand strengths and forms from their linked generics when generics are explicit"

    def handle(self, *args, **options):
        updated = 0
        with transaction.atomic():
            meds = Medication.objects.filter(strength__in=[None, "", "-"]) | Medication.objects.filter(form__in=[None, "", "-"])
            for med in meds:
                gen = med.generic
                if not gen:
                    continue
                strength_src = (gen.strength or "").strip()
                form_src = (gen.dosage_form or "").strip()
                changed = False
                if (med.strength in [None, "", "-"]) and strength_src:
                    med.strength = strength_src
                    changed = True
                if (med.form in [None, "", "-"]) and form_src:
                    med.form = form_src
                    changed = True
                if changed:
                    med.save(update_fields=["strength", "form"])
                    updated += 1
        self.stdout.write(self.style.SUCCESS(f"Updated brands from generics: {updated}"))
