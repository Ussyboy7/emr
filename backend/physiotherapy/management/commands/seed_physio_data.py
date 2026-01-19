"""
Management command to seed physiotherapy test data.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from patients.models import Patient
from physiotherapy.models import PhysioTemplate, PhysioOrder, PhysioSession

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed physiotherapy test data'

    def handle(self, *args, **options):
        # Create templates
        templates_data = [
            {'name': 'Back Pain Treatment', 'code': 'BP001', 'category': 'musculoskeletal'},
            {'name': 'Knee Rehabilitation', 'code': 'KN001', 'category': 'orthopedic'},
            {'name': 'Shoulder Therapy', 'code': 'SH001', 'category': 'musculoskeletal'},
        ]

        for template_data in templates_data:
            PhysioTemplate.objects.get_or_create(
                code=template_data['code'],
                defaults=template_data
            )

        # Get first patient and user for test data
        try:
            patient = Patient.objects.first()
            user = User.objects.filter(is_staff=True).first()

            if patient and user:
                # Create a test order
                order, created = PhysioOrder.objects.get_or_create(
                    patient=patient,
                    ordered_by=user,
                    diagnosis='Test diagnosis',
                    defaults={'status': 'pending'}
                )

                if created:
                    self.stdout.write(f'Created test physiotherapy order: {order}')

                # Create a test session
                session, created = PhysioSession.objects.get_or_create(
                    order=order,
                    physiotherapist=user,
                    defaults={'status': 'scheduled', 'notes': 'Test session'}
                )

                if created:
                    self.stdout.write(f'Created test physiotherapy session: {session}')

        except Exception as e:
            self.stdout.write(f'Could not create test data: {e}')

        self.stdout.write('Physiotherapy test data seeded successfully!')