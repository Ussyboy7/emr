from django.core.management.base import BaseCommand
from accounts.models import SystemRole

class Command(BaseCommand):
    help = 'Populate SystemRole table with predefined professional roles'

    def handle(self, *args, **options):
        # Predefined system roles based on the legacy SYSTEM_ROLE_CHOICES
        system_roles_data = [
            {
                'name': 'System Administrator',
                'description': 'Full system access with all permissions'
            },
            {
                'name': 'Medical Doctor',
                'description': 'Full clinical access for patient care and consultation'
            },
            {
                'name': 'Nursing Officer',
                'description': 'Nursing care, vitals, and patient triage'
            },
            {
                'name': 'Laboratory Scientist',
                'description': 'Laboratory testing and result management'
            },
            {
                'name': 'Pharmacist',
                'description': 'Prescription dispensing and inventory management'
            },
            {
                'name': 'Radiologist',
                'description': 'Radiology studies and reporting'
            },
            {
                'name': 'Optamologist',
                'description': 'Ophthalmology and eye care services'
            },
            {
                'name': 'Medical Records Officer',
                'description': 'Patient and visit record management'
            },
            {
                'name': 'Admin Staff',
                'description': 'Administrative support functions'
            }
        ]

        created_count = 0
        for role_data in system_roles_data:
            role, created = SystemRole.objects.get_or_create(
                name=role_data['name'],
                defaults={
                    'description': role_data['description'],
                    'is_active': True
                }
            )
            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'Created system role: {role.name}')
                )
            else:
                self.stdout.write(
                    f'System role already exists: {role.name}'
                )

        self.stdout.write(
            self.style.SUCCESS(f'Successfully processed {len(system_roles_data)} system roles. Created: {created_count}')
        )