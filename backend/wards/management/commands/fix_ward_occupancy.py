"""
Django management command to fix ward occupancy counts.
"""
from django.core.management.base import BaseCommand
from wards.models import Ward


class Command(BaseCommand):
    help = "Recalculate and fix ward occupancy counts"

    def handle(self, *args, **options):
        self.stdout.write("Fixing ward occupancy counts...")

        wards_fixed = Ward.fix_all_occupancy_counts()

        if wards_fixed > 0:
            self.stdout.write(
                self.style.SUCCESS(f"Fixed occupancy counts for {wards_fixed} wards")
            )
        else:
            self.stdout.write("All ward occupancy counts are already correct")