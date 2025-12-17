"""
Django management command to seed the database with inventory items for all medications.
Run with: python manage.py seed_inventory
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from pharmacy.models import Medication, MedicationInventory
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seed the database with inventory items for all medications'

    def add_arguments(self, parser):
        parser.add_argument(
            '--quantity',
            type=int,
            default=1000,
            help='Default quantity for each inventory item (default: 1000)',
        )
        parser.add_argument(
            '--min-stock',
            type=int,
            default=100,
            help='Default minimum stock level (default: 100)',
        )

    def handle(self, *args, **options):
        default_quantity = options['quantity']
        default_min_stock = options['min_stock']
        
        # Get all active medications
        medications = Medication.objects.filter(is_active=True)
        
        if not medications.exists():
            self.stdout.write(self.style.WARNING('No active medications found. Please run seed_medications first.'))
            return
        
        created_count = 0
        updated_count = 0
        
        for medication in medications:
            # Generate a batch number based on medication code
            batch_number = f"BATCH-{medication.code}-001"
            
            # Set expiry date to 2 years from now
            expiry_date = (timezone.now() + timedelta(days=730)).date()
            
            # Determine unit from medication
            unit = medication.unit or 'tablet'
            
            # Check if inventory item already exists for this medication
            inventory_item, created = MedicationInventory.objects.update_or_create(
                medication=medication,
                batch_number=batch_number,
                defaults={
                    'expiry_date': expiry_date,
                    'quantity': Decimal(default_quantity),
                    'unit': unit,
                    'min_stock_level': Decimal(default_min_stock),
                    'location': 'Main Pharmacy',
                    'supplier': 'Default Supplier',
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'Created inventory: {medication.name} - Batch {batch_number}'))
            else:
                updated_count += 1
                self.stdout.write(self.style.WARNING(f'Updated inventory: {medication.name} - Batch {batch_number}'))

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Inventory seeding complete!\n'
            f'  Created: {created_count} inventory items\n'
            f'  Updated: {updated_count} inventory items\n'
            f'  Total medications with inventory: {medications.count()}'
        ))

