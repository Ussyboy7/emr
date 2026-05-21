"""
Backfill location_clinic on existing Patient records where it is null.
Uses the patient's most recent Visit's location_clinic as the source of truth.
If a patient has no visits, falls back to the creator's default clinic (if any).
"""
from django.db.models import Max, OuterRef, Subquery
from django.core.management.base import BaseCommand
from patients.models import Patient, Visit


class Command(BaseCommand):
    help = __doc__.strip().splitlines()[0]

    def handle(self, *args, **options):
        # Subquery: most recent visit's location_clinic per patient
        latest_visit = (
            Visit.objects
            .filter(patient=OuterRef('pk'))
            .exclude(location_clinic__isnull=True)
            .order_by('-created_at')
            .values('location_clinic')[:1]
        )

        qs = Patient.objects.filter(location_clinic__isnull=True).annotate(
            visit_clinic=Subquery(latest_visit)
        )

        updated_from_visit = 0
        updated_from_creator = 0
        skipped = 0

        for patient in qs.iterator(chunk_size=200):
            if patient.visit_clinic is not None:
                Patient.objects.filter(pk=patient.pk).update(
                    location_clinic=patient.visit_clinic
                )
                updated_from_visit += 1
                continue

            creator_clinic_id = None
            if patient.created_by_id:
                user = patient.created_by
                assigned = list(user.clinics.values_list('id', flat=True))
                if assigned:
                    creator_clinic_id = assigned[0]
                elif user.clinic_id:
                    creator_clinic_id = user.clinic_id

            if creator_clinic_id is not None:
                Patient.objects.filter(pk=patient.pk).update(
                    location_clinic_id=creator_clinic_id
                )
                updated_from_creator += 1
            else:
                skipped += 1

        self.stdout.write(
            f"Backfill complete: {updated_from_visit} from visits, "
            f"{updated_from_creator} from creator, {skipped} skipped (no clinic source)"
        )
