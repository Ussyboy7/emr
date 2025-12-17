"""
Management command to recalculate prescription statuses.
This fixes prescriptions that have incorrect status values.
"""
from django.core.management.base import BaseCommand
from pharmacy.models import Prescription


class Command(BaseCommand):
    help = 'Recalculate prescription statuses based on medication items'

    def add_arguments(self, parser):
        parser.add_argument(
            '--prescription-id',
            type=str,
            help='Fix a specific prescription by ID',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Fix all prescriptions',
        )

    def handle(self, *args, **options):
        prescription_id = options.get('prescription_id')
        fix_all = options.get('all', False)

        if prescription_id:
            try:
                prescription = Prescription.objects.get(prescription_id=prescription_id)
                old_status = prescription.status
                prescription.recalculate_status()
                prescription.refresh_from_db()
                new_status = prescription.status
                
                if old_status != new_status:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'✓ Prescription {prescription_id}: {old_status} → {new_status}'
                        )
                    )
                else:
                    self.stdout.write(
                        f'  Prescription {prescription_id}: status already correct ({new_status})'
                    )
            except Prescription.DoesNotExist:
                self.stdout.write(
                    self.style.ERROR(f'Prescription {prescription_id} not found')
                )
        elif fix_all:
            prescriptions = Prescription.objects.all()
            fixed_count = 0
            
            for prescription in prescriptions:
                old_status = prescription.status
                prescription.recalculate_status()
                prescription.refresh_from_db()
                new_status = prescription.status
                
                if old_status != new_status:
                    fixed_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'✓ Prescription {prescription.prescription_id}: {old_status} → {new_status}'
                        )
                    )
            
            self.stdout.write(
                self.style.SUCCESS(f'\n✓ Fixed {fixed_count} prescription(s)')
            )
        else:
            self.stdout.write(
                self.style.ERROR(
                    'Please specify --prescription-id <id> or --all'
                )
            )

