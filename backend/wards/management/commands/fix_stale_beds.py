"""
Management command to find and release beds that are marked 'occupied'
but have no active admission (admitted / pending_discharge) pointing to them.

Usage:
    python manage.py fix_stale_beds           # dry-run, shows what would be fixed
    python manage.py fix_stale_beds --apply   # actually writes the fixes
"""
from django.core.management.base import BaseCommand
from wards.models import Bed, Ward


class Command(BaseCommand):
    help = 'Release stale occupied beds that have no active admission linked.'

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

        # Find every occupied bed
        occupied = Bed.objects.filter(status='occupied').select_related('ward')

        stale = []
        for bed in occupied:
            # A bed is NOT stale if at least one active admission still references it
            active_admissions = bed.admissions.filter(
                status__in=['admitted', 'pending_discharge']
            )
            if not active_admissions.exists():
                stale.append(bed)

        if not stale:
            self.stdout.write(self.style.SUCCESS('No stale beds found — everything looks clean.'))
            return

        self.stdout.write(f'Found {len(stale)} stale bed(s):\n')
        for bed in stale:
            patient_info = (
                f'  current_patient={bed.current_patient_id}'
                if bed.current_patient_id
                else '  (no current_patient set)'
            )
            self.stdout.write(f'  • Bed {bed.bed_number} — {bed.ward.name}{patient_info}')

        if not apply:
            self.stdout.write(
                self.style.WARNING(
                    '\nDry-run complete. Re-run with --apply to release these beds.'
                )
            )
            return

        # Apply: free each stale bed
        freed_count = 0
        affected_wards = set()
        for bed in stale:
            bed.current_patient = None
            bed.status = 'available'
            bed.admission_date = None
            bed.save(update_fields=['current_patient', 'status', 'admission_date'])
            affected_wards.add(bed.ward_id)
            freed_count += 1
            self.stdout.write(
                self.style.SUCCESS(f'  ✓ Released Bed {bed.bed_number} ({bed.ward.name})')
            )

        # Recalculate occupancy for each affected ward
        self.stdout.write('\nRecalculating ward occupancy...')
        for ward in Ward.objects.filter(id__in=affected_wards):
            old = ward.occupied_beds
            ward.recalculate_occupancy()
            ward.refresh_from_db()
            self.stdout.write(
                f'  {ward.name}: {old} → {ward.occupied_beds} occupied beds'
            )

        self.stdout.write(
            self.style.SUCCESS(f'\nDone. Released {freed_count} stale bed(s).')
        )
