"""
Management command to migrate existing radiology orders to have studies.
This is needed because the radiology system was updated to work like lab orders
where each order contains individual studies.
"""

from django.core.management.base import BaseCommand
from ...models import RadiologyOrder, RadiologyStudy


class Command(BaseCommand):
    help = 'Migrate existing radiology orders to have studies'

    def handle(self, *args, **options):
        orders_without_studies = RadiologyOrder.objects.filter(studies__isnull=True).distinct()

        self.stdout.write(f'Found {orders_without_studies.count()} orders without studies')

        for order in orders_without_studies:
            # Create a default study for each order
            # Since we don't have the original study data, we'll create a generic one
            study = RadiologyStudy.objects.create(
                order=order,
                procedure='Radiology Study',  # Generic procedure name
                body_part='',  # Unknown body part
                modality='X-Ray',  # Default modality
                status='pending',
                images_count=0,
                technical_notes='Migrated from legacy order'
            )

            self.stdout.write(f'Created study {study.id} for order {order.order_id}')

        self.stdout.write(self.style.SUCCESS('Migration completed!'))