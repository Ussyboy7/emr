"""
Django management command to restore backed up data.
"""
import os
import json
from django.core.management.base import BaseCommand
from django.core.serializers import deserialize
from accounts.models import User
from organization.models import Clinic, Department
from permissions.models import Role, UserRole


class Command(BaseCommand):
    help = "Restore data from backup files"

    def add_arguments(self, parser):
        parser.add_argument(
            "backup_dir",
            help="Directory containing backup files",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be restored without actually doing it",
        )

    def handle(self, *args, **options):
        backup_dir = options["backup_dir"]
        dry_run = options["dry_run"]

        if not os.path.exists(backup_dir):
            self.stderr.write(f"Backup directory {backup_dir} does not exist")
            return

        # Find the most recent backup files
        files = os.listdir(backup_dir)
        backup_files = {}

        for file in files:
            if file.startswith("users_backup_") and file.endswith(".json"):
                backup_files["users"] = os.path.join(backup_dir, file)
            elif file.startswith("clinics_backup_") and file.endswith(".json"):
                backup_files["clinics"] = os.path.join(backup_dir, file)
            elif file.startswith("departments_backup_") and file.endswith(".json"):
                backup_files["departments"] = os.path.join(backup_dir, file)
            elif file.startswith("roles_backup_") and file.endswith(".json"):
                backup_files["roles"] = os.path.join(backup_dir, file)

        if dry_run:
            self.stdout.write("DRY RUN - Would restore the following:")
        else:
            self.stdout.write("Restoring data...")

        # Restore users
        if "users" in backup_files:
            with open(backup_files["users"], 'r') as f:
                data = f.read()
                if dry_run:
                    users_count = len(json.loads(data))
                    self.stdout.write(f"✓ Would restore {users_count} users")
                else:
                    for obj in deserialize('json', data):
                        obj.save()
                    self.stdout.write(f"✓ Restored {User.objects.count()} users")
        else:
            self.stdout.write("⚠ No users backup file found")

        # Restore clinics
        if "clinics" in backup_files:
            with open(backup_files["clinics"], 'r') as f:
                data = f.read()
                if dry_run:
                    clinics_count = len(json.loads(data))
                    self.stdout.write(f"✓ Would restore {clinics_count} clinics")
                else:
                    for obj in deserialize('json', data):
                        obj.save()
                    self.stdout.write(f"✓ Restored {Clinic.objects.count()} clinics")
        else:
            self.stdout.write("⚠ No clinics backup file found")

        # Restore departments
        if "departments" in backup_files:
            with open(backup_files["departments"], 'r') as f:
                data = f.read()
                if dry_run:
                    departments_count = len(json.loads(data))
                    self.stdout.write(f"✓ Would restore {departments_count} departments")
                else:
                    for obj in deserialize('json', data):
                        obj.save()
                    self.stdout.write(f"✓ Restored {Department.objects.count()} departments")
        else:
            self.stdout.write("⚠ No departments backup file found")

        # Restore roles
        if "roles" in backup_files:
            with open(backup_files["roles"], 'r') as f:
                combined_data = json.load(f)

                if dry_run:
                    roles_count = len(combined_data.get('roles', []))
                    user_roles_count = len(combined_data.get('user_roles', []))
                    self.stdout.write(f"✓ Would restore {roles_count} roles and {user_roles_count} user roles")
                else:
                    # Restore roles first
                    for obj in deserialize('json', json.dumps(combined_data['roles'])):
                        obj.save()

                    # Then restore user roles
                    for obj in deserialize('json', json.dumps(combined_data['user_roles'])):
                        obj.save()

                    self.stdout.write(f"✓ Restored {Role.objects.count()} roles and {UserRole.objects.count()} user roles")
        else:
            self.stdout.write("⚠ No roles backup file found")

        if dry_run:
            self.stdout.write("\nUse without --dry-run to actually perform the restore")
        else:
            self.stdout.write(self.style.SUCCESS("Restore completed!"))