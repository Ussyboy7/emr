from django.core.management.base import BaseCommand
from django.db import transaction
from pharmacy.models import Medication, GenericMedication


class Command(BaseCommand):
    help = "Create GenericMedication records from existing medications and link brands to generics"

    def handle(self, *args, **options):
        created = 0
        linked = 0
        with transaction.atomic():
            # Build a map of (generic_name, strength, form) -> GenericMedication
            generic_map = {}
            # Fetch distinct keys from medications
            meds = Medication.objects.all().values('generic_name', 'strength', 'form')
            distinct_keys = set(
                (
                    (m['generic_name'] or '').strip(),
                    (m['strength'] or '').strip(),
                    (m['form'] or '').strip(),
                )
                for m in meds
            )
            # Create generics
            for g_name, strength, form in distinct_keys:
                if not g_name:
                    continue
                gm, gm_created = GenericMedication.objects.get_or_create(
                    name=g_name,
                    strength=strength,
                    dosage_form=form,
                    defaults={
                        'active_ingredient': g_name,  # fallback
                        'route': '',
                        'is_active': True,
                    }
                )
                generic_map[(g_name, strength, form)] = gm
                if gm_created:
                    created += 1

            # Link medications to generics
            for med in Medication.objects.all():
                key = (
                    (med.generic_name or '').strip(),
                    (med.strength or '').strip(),
                    (med.form or '').strip()
                )
                gm = generic_map.get(key)
                if gm and med.generic_id != gm.id:
                    med.generic = gm
                    med.save(update_fields=['generic'])
                    linked += 1

        self.stdout.write(self.style.SUCCESS(f"Created {created} generics, linked {linked} medications"))
