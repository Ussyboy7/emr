"""
Management command to reconcile bed rows with active admissions.

Fixes two kinds of drift:
  * occupied beds with no active admission (admitted / pending_discharge)
    pointing at them — released;
  * free beds still referenced by an active admission — re-occupied for
    that admission's patient.

Usage:
    python manage.py fix_stale_beds           # dry-run, shows what would be fixed
    python manage.py fix_stale_beds --apply   # actually writes the fixes
"""
from django.core.management.base import BaseCommand
from wards.models import Bed, Ward

ACTIVE_ADMISSION_STATUSES = ('admitted', 'pending_discharge')


class Command(BaseCommand):
    help = 'Reconcile occupied/free beds with the active admissions that reference them.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Apply the fixes (default is dry-run).',
        )

    def handle(self, *args, **options):
        apply = options['apply']
        mode = 'APPLY' if apply else 'DRY-RUN'
        self.stdout.write(f'\n=== fix_stale_beds [{mode}] ===\n')

        stale = [
            bed
            for bed in Bed.objects.filter(status='occupied').select_related('ward')
            if not self._active_admission(bed)
        ]

        orphans = []
        for bed in (
            Bed.objects.exclude(status='occupied')
            .select_related('ward', 'current_patient')
        ):
            admission = self._active_admission(bed)
            if admission is not None:
                orphans.append((bed, admission))

        if not stale and not orphans:
            self.stdout.write(self.style.SUCCESS('No stale beds found — everything looks clean.'))
            return

        if stale:
            self.stdout.write(f'Found {len(stale)} stale occupied bed(s):\n')
            for bed in stale:
                patient_info = (
                    f'  current_patient={bed.current_patient_id}'
                    if bed.current_patient_id
                    else '  (no current_patient set)'
                )
                self.stdout.write(f'  • Bed {bed.bed_number} — {bed.ward.name}{patient_info}')

        if orphans:
            self.stdout.write(f'\nFound {len(orphans)} free bed(s) still held by an active admission:\n')
            for bed, admission in orphans:
                self.stdout.write(
                    f'  • Bed {bed.bed_number} — {bed.ward.name} '
                    f'(admission {admission.admission_id}, patient {admission.patient_id})'
                )

        if not apply:
            self.stdout.write(
                self.style.WARNING(
                    '\nDry-run complete. Re-run with --apply to reconcile these beds.'
                )
            )
            return

        affected_wards = set()
        for bed in stale:
            bed.release()
            affected_wards.add(bed.ward_id)
            self.stdout.write(
                self.style.SUCCESS(f'  ✓ Released Bed {bed.bed_number} ({bed.ward.name})')
            )

        for bed, admission in orphans:
            bed.current_patient = admission.patient
            bed.status = 'occupied'
            bed.admission_date = admission.admission_date
            bed.save(update_fields=['current_patient', 'status', 'admission_date'])
            affected_wards.add(bed.ward_id)
            self.stdout.write(
                self.style.SUCCESS(
                    f'  ✓ Re-occupied Bed {bed.bed_number} ({bed.ward.name}) '
                    f'for admission {admission.admission_id}'
                )
            )

        self.stdout.write('\nRecalculating ward occupancy...')
        for ward in Ward.objects.filter(id__in=affected_wards):
            old = ward.occupied_beds
            ward.recalculate_occupancy()
            ward.refresh_from_db()
            self.stdout.write(
                f'  {ward.name}: {old} → {ward.occupied_beds} occupied beds'
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'\nDone. Released {len(stale)} bed(s), re-occupied {len(orphans)} bed(s).'
            )
        )

    @staticmethod
    def _active_admission(bed):
        return (
            bed.admissions.filter(status__in=ACTIVE_ADMISSION_STATUSES)
            .order_by('-admission_date')
            .first()
        )