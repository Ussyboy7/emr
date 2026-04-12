from django.core.management.base import BaseCommand
from laboratory.models import LabPartner


class Command(BaseCommand):
    help = 'Add a lab partner (outsourced lab)'

    def add_arguments(self, parser):
        parser.add_argument('name', type=str, help='Partner name')
        parser.add_argument('--code', type=str, default='', help='Optional short code')
        parser.add_argument('--phone', type=str, default='', help='Optional phone number')
        parser.add_argument('--email', type=str, default='', help='Optional email')
        parser.add_argument('--notes', type=str, default='', help='Optional notes')
        parser.add_argument('--sort-order', type=int, default=0, help='Sort order (default 0)')

    def handle(self, *args, **options):
        name = options['name']
        code = options.get('code') or ''
        phone = options.get('phone') or ''
        email = options.get('email') or ''
        notes = options.get('notes') or ''
        sort_order = options.get('sort_order', 0)

        partner, created = LabPartner.objects.get_or_create(
            name=name,
            defaults={
                'code': code,
                'phone': phone,
                'email': email,
                'notes': notes,
                'sort_order': sort_order,
                'is_active': True,
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ Created lab partner: {partner.name}'))
        else:
            self.stdout.write(self.style.WARNING(f'⚠ Lab partner "{partner.name}" already exists'))

        self.stdout.write(f'\nPartner Details:')
        self.stdout.write(f'  Name: {partner.name}')
        self.stdout.write(f'  Code: {partner.code or "N/A"}')
        self.stdout.write(f'  Phone: {partner.phone or "N/A"}')
        self.stdout.write(f'  Email: {partner.email or "N/A"}')
        self.stdout.write(f'  Active: {"Yes" if partner.is_active else "No"}')
