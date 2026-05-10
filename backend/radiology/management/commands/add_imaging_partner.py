from django.core.management.base import BaseCommand
from radiology.models import ImagingPartner


class Command(BaseCommand):
    help = 'Add an imaging partner (outsourced imaging center)'

    def add_arguments(self, parser):
        parser.add_argument('name', type=str, help='Partner name')
        parser.add_argument('--code', type=str, default='', help='Optional short code')
        parser.add_argument('--phone', type=str, default='', help='Optional phone number')
        parser.add_argument('--email', type=str, default='', help='Optional email')
        parser.add_argument('--address', type=str, default='', help='Optional postal address (multi-line; use \\n for line breaks)')
        parser.add_argument(
            '--contact-title',
            type=str,
            default='',
            help='Addressee role used in the "To:" block on letters (e.g. "The Medical Director")',
        )
        parser.add_argument('--notes', type=str, default='', help='Optional notes')
        parser.add_argument('--sort-order', type=int, default=0, help='Sort order (default 0)')

    def handle(self, *args, **options):
        name = options['name']
        code = options.get('code') or ''
        phone = options.get('phone') or ''
        email = options.get('email') or ''
        address = (options.get('address') or '').replace('\\n', '\n')
        contact_title = options.get('contact_title') or ''
        notes = options.get('notes') or ''
        sort_order = options.get('sort_order', 0)

        defaults = {
            'code': code,
            'phone': phone,
            'email': email,
            'address': address,
            'notes': notes,
            'sort_order': sort_order,
            'is_active': True,
        }
        if contact_title:
            defaults['contact_person_title'] = contact_title

        partner, created = ImagingPartner.objects.get_or_create(
            name=name,
            defaults=defaults,
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ Created imaging partner: {partner.name}'))
        else:
            self.stdout.write(self.style.WARNING(f'⚠ Imaging partner "{partner.name}" already exists'))

        self.stdout.write(f'\nPartner Details:')
        self.stdout.write(f'  Name: {partner.name}')
        self.stdout.write(f'  Code: {partner.code or "N/A"}')
        self.stdout.write(f'  Phone: {partner.phone or "N/A"}')
        self.stdout.write(f'  Email: {partner.email or "N/A"}')
        self.stdout.write(f'  Active: {"Yes" if partner.is_active else "No"}')
