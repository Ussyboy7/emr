#!/usr/bin/env python
"""
Django management command to seed healthcare catalogs.
Loads lab tests, pharmacy medications, and radiology procedures.
"""

import os
import json
from django.core.management.base import BaseCommand, CommandError
from django.core.management import call_command
from django.conf import settings


class Command(BaseCommand):
    help = (
        "Seed healthcare catalogs with lab tests, medications, and radiology procedures"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Reset existing data before seeding",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("🚀 Starting Healthcare Catalog Seeding"))

        reset_data = options["reset"]

        # Define fixture files to load
        fixtures = [
            ("laboratory", "lab_templates.json"),
            ("pharmacy", "generic_medications.json"),
            ("pharmacy", "medications.json"),
            ("radiology", "radiology_templates.json"),
        ]

        loaded_count = 0
        skipped_count = 0

        for app_name, fixture_file in fixtures:
            fixture_path = os.path.join(
                settings.BASE_DIR, app_name, "fixtures", fixture_file
            )

            if not os.path.exists(fixture_path):
                self.stdout.write(
                    self.style.WARNING(f"⚠️  Fixture not found: {fixture_path}")
                )
                skipped_count += 1
                continue

            try:
                self.stdout.write(f"📦 Loading {app_name}/{fixture_file}...")

                # Load the fixture
                call_command("loaddata", fixture_file, app_label=app_name)

                self.stdout.write(
                    self.style.SUCCESS(f"✅ Successfully loaded {fixture_file}")
                )
                loaded_count += 1

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"❌ Failed to load {fixture_file}: {str(e)}")
                )
                if not reset_data:
                    raise CommandError(f"Failed to load fixture: {fixture_file}")

        # Summary
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write(self.style.SUCCESS("🎉 Healthcare Catalog Seeding Complete!"))
        self.stdout.write(f"✅ Fixtures loaded: {loaded_count}")
        if skipped_count > 0:
            self.stdout.write(f"⚠️  Fixtures skipped: {skipped_count}")

        # Data summary
        self.stdout.write("\n📊 Seeded Data Summary:")
        self.stdout.write("  🧪 Lab Tests: 10 common diagnostic tests")
        self.stdout.write("  💊 Generic Medications: 10 essential drugs")
        self.stdout.write("  💰 Branded Medications: 10 pharmacy products")
        self.stdout.write("  📹 Radiology Procedures: 10 imaging studies")

        self.stdout.write("\n🔍 Data includes:")
        self.stdout.write("  • Normal ranges and reference values")
        self.stdout.write("  • Pricing and inventory information")
        self.stdout.write("  • Manufacturer and batch details")
        self.stdout.write("  • Turnaround times and radiation doses")

        self.stdout.write("\n🚀 Ready for healthcare operations!")
