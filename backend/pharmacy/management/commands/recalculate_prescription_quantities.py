"""
Management command to recalculate prescription item quantities
based on dose, frequency, and duration for existing prescriptions.
"""
from django.core.management.base import BaseCommand
from pharmacy.models import PrescriptionItem


class Command(BaseCommand):
    help = 'Recalculate prescription item quantities based on dose, frequency, and duration'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be updated without actually updating',
        )
        parser.add_argument(
            '--only-undispensed',
            action='store_true',
            default=True,
            help='Only recalculate items that have not been dispensed (default: True)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        only_undispensed = options['only_undispensed']
        
        # Get items to recalculate
        queryset = PrescriptionItem.objects.all()
        if only_undispensed:
            queryset = queryset.filter(dispensed_quantity=0)
        
        total_items = queryset.count()
        updated_count = 0
        skipped_count = 0
        
        self.stdout.write(f'Found {total_items} prescription items to process...')
        
        for item in queryset:
            old_quantity = item.quantity
            was_updated = item.recalculate_quantity()
            
            if was_updated:
                if old_quantity != item.quantity:
                    if not dry_run:
                        item.save(update_fields=['quantity'])
                    updated_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'✓ Item {item.id}: {item.medication.name if item.medication else "Unknown"} - '
                            f'{old_quantity} → {item.quantity}'
                        )
                    )
                else:
                    skipped_count += 1
            else:
                skipped_count += 1
        
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Summary:'))
        self.stdout.write(f'  Total items processed: {total_items}')
        self.stdout.write(f'  Updated: {updated_count}')
        self.stdout.write(f'  Skipped (no change or already dispensed): {skipped_count}')
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\nDRY RUN - No changes were saved. Run without --dry-run to apply changes.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'\nSuccessfully updated {updated_count} prescription items.'))
