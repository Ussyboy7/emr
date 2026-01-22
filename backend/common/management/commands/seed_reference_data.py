"""
Django management command to safely seed reference data without affecting existing user data.
Seeds ICD codes, lab templates, radiology templates, and pharmacy medications.
"""
from django.core.management.base import BaseCommand
from django.core.management import call_command
import subprocess
import sys


class Command(BaseCommand):
    help = "Safely seed reference data (ICD codes, lab templates, radiology, medications) without affecting existing users/data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--skip-icd",
            action="store_true",
            help="Skip ICD codes seeding",
        )
        parser.add_argument(
            "--skip-lab",
            action="store_true",
            help="Skip lab templates seeding",
        )
        parser.add_argument(
            "--skip-radiology",
            action="store_true",
            help="Skip radiology templates seeding",
        )
        parser.add_argument(
            "--skip-medications",
            action="store_true",
            help="Skip pharmacy medications seeding",
        )
        parser.add_argument(
            "--skip-inventory",
            action="store_true",
            help="Skip pharmacy inventory seeding",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("🩺 Starting Safe Reference Data Seeding..."))
        self.stdout.write("This will add reference data without deleting existing users or data.\n")

        # Track what we'll seed
        operations = []

        if not options["skip_icd"]:
            operations.append(("ICD-10 Codes", "seed_icd_codes"))
        if not options["skip_lab"]:
            operations.append(("Lab Templates", "seed_lab_templates"))
        if not options["skip_radiology"]:
            operations.append(("Radiology Templates", "populate_radiology_templates"))
        if not options["skip_medications"]:
            operations.append(("Pharmacy Medications", "seed_medications"))
        if not options["skip_inventory"]:
            operations.append(("Pharmacy Inventory", "seed_inventory"))

        if not operations:
            self.stdout.write(self.style.WARNING("No operations selected. Use --help to see options."))
            return

        self.stdout.write("Will seed the following:")
        for name, command in operations:
            self.stdout.write(f"  • {name}")
        self.stdout.write("")

        # Confirm operation (non-interactive in containers)
        self.stdout.write("⚠️  This operation is safe and won't delete existing data.")
        self.stdout.write("Proceeding with reference data seeding...")

        # Execute seeding operations
        success_count = 0
        error_count = 0

        for name, command in operations:
            try:
                self.stdout.write(self.style.MIGRATE_LABEL(f"Seeding {name}..."))

                # Try using call_command first (Django way)
                try:
                    call_command(command, verbosity=1)
                    self.stdout.write(self.style.SUCCESS(f"✓ {name} seeded successfully"))
                    success_count += 1
                except Exception as e:
                    # Fall back to subprocess if call_command fails
                    self.stdout.write(f"Trying subprocess method for {command}...")
                    result = subprocess.run([
                        sys.executable, 'manage.py', command
                    ], capture_output=True, text=True, cwd='.')

                    if result.returncode == 0:
                        self.stdout.write(self.style.SUCCESS(f"✓ {name} seeded successfully"))
                        success_count += 1
                    else:
                        raise Exception(f"Command failed: {result.stderr}")

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"✗ Failed to seed {name}: {str(e)}"))
                error_count += 1

        # Summary
        self.stdout.write(self.style.MIGRATE_HEADING("\n📊 Seeding Summary:"))
        self.stdout.write(f"✅ Successful: {success_count}")
        if error_count > 0:
            self.stdout.write(self.style.ERROR(f"❌ Failed: {error_count}"))
        else:
            self.stdout.write("🎉 All reference data seeded successfully!")

        self.stdout.write("\n💡 Your existing users and data are preserved.")
        self.stdout.write("   Use 'python manage.py backup_data' before any risky operations.")