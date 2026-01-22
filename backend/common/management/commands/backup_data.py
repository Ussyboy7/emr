"""
Django management command to backup important data before seeding.
"""
import os
import json
from datetime import datetime
from django.core.management.base import BaseCommand
from django.core.serializers import serialize
from accounts.models import User
from organization.models import Clinic, Department
from permissions.models import Role, UserRole


class Command(BaseCommand):
    help = "Backup important data before running seed operations"

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir",
            default="/backups",
            help="Directory to save backup files",
        )

    def handle(self, *args, **options):
        output_dir = options["output_dir"]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Create backup directory
        os.makedirs(output_dir, exist_ok=True)

        self.stdout.write(f"Backing up data to {output_dir}...")

        # Backup users
        users_file = os.path.join(output_dir, f"users_backup_{timestamp}.json")
        with open(users_file, 'w') as f:
            data = serialize('json', User.objects.all())
            f.write(data)
        self.stdout.write(f"✓ Backed up {User.objects.count()} users")

        # Backup clinics
        clinics_file = os.path.join(output_dir, f"clinics_backup_{timestamp}.json")
        with open(clinics_file, 'w') as f:
            data = serialize('json', Clinic.objects.all())
            f.write(data)
        self.stdout.write(f"✓ Backed up {Clinic.objects.count()} clinics")

        # Backup departments
        departments_file = os.path.join(output_dir, f"departments_backup_{timestamp}.json")
        with open(departments_file, 'w') as f:
            data = serialize('json', Department.objects.all())
            f.write(data)
        self.stdout.write(f"✓ Backed up {Department.objects.count()} departments")

        # Backup roles and user roles
        roles_file = os.path.join(output_dir, f"roles_backup_{timestamp}.json")
        with open(roles_file, 'w') as f:
            roles_data = serialize('json', Role.objects.all())
            user_roles_data = serialize('json', UserRole.objects.all())
            combined_data = {
                'roles': json.loads(roles_data),
                'user_roles': json.loads(user_roles_data)
            }
            json.dump(combined_data, f, indent=2)
        self.stdout.write(f"✓ Backed up {Role.objects.count()} roles and {UserRole.objects.count()} user roles")

        # Create a summary file
        summary_file = os.path.join(output_dir, f"backup_summary_{timestamp}.txt")
        with open(summary_file, 'w') as f:
            f.write(f"EMR Data Backup - {datetime.now()}\n")
            f.write("=" * 50 + "\n")
            f.write(f"Users: {User.objects.count()}\n")
            f.write(f"Clinics: {Clinic.objects.count()}\n")
            f.write(f"Departments: {Department.objects.count()}\n")
            f.write(f"Roles: {Role.objects.count()}\n")
            f.write(f"User Roles: {UserRole.objects.count()}\n")
            f.write("\nBackup files created:\n")
            f.write(f"- {users_file}\n")
            f.write(f"- {clinics_file}\n")
            f.write(f"- {departments_file}\n")
            f.write(f"- {roles_file}\n")
            f.write(f"- {summary_file}\n")

        self.stdout.write(self.style.SUCCESS(f"Backup completed! Summary: {summary_file}"))