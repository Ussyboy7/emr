"""Quick CLI to seed a referral facility (mirrors ``add_lab_partner``)."""
from django.core.management.base import BaseCommand
from consultation.models import ReferralFacility


class Command(BaseCommand):
    help = 'Add a referral facility (partner / receiving hospital)'

    def add_arguments(self, parser):
        parser.add_argument('name', type=str, help='Facility name')
        parser.add_argument('--code', type=str, default='', help='Optional short code')
        parser.add_argument(
            '--facility-type',
            type=str,
            default='external',
            choices=['internal', 'external', 'specialist'],
            help='Default: external',
        )
        parser.add_argument('--phone', type=str, default='', help='Optional phone number')
        parser.add_argument('--email', type=str, default='', help='Optional email')
        parser.add_argument('--address', type=str, default='', help='Multi-line postal address')
        parser.add_argument(
            '--contact-title',
            type=str,
            default='The Medical Director',
            help="Addressee role (default: 'The Medical Director')",
        )
        parser.add_argument('--specialties', type=str, default='', help='Comma-separated list of specialties')
        parser.add_argument('--notes', type=str, default='', help='Optional notes')
        parser.add_argument('--sort-order', type=int, default=0, help='Sort order (default 0)')

    def handle(self, *args, **options):
        name = options['name']

        facility, created = ReferralFacility.objects.get_or_create(
            name=name,
            defaults={
                'code': options.get('code') or '',
                'facility_type': options.get('facility_type') or 'external',
                'phone': options.get('phone') or '',
                'email': options.get('email') or '',
                'address': options.get('address') or '',
                'contact_person_title': options.get('contact_title') or 'The Medical Director',
                'specialties': options.get('specialties') or '',
                'notes': options.get('notes') or '',
                'sort_order': options.get('sort_order', 0),
                'is_active': True,
            },
        )

        if created:
            self.stdout.write(self.style.SUCCESS(f'Created referral facility: {facility.name}'))
        else:
            self.stdout.write(self.style.WARNING(f'Referral facility "{facility.name}" already exists'))

        self.stdout.write('\nFacility Details:')
        self.stdout.write(f'  Name:    {facility.name}')
        self.stdout.write(f'  Code:    {facility.code or "N/A"}')
        self.stdout.write(f'  Type:    {facility.facility_type}')
        self.stdout.write(f'  Phone:   {facility.phone or "N/A"}')
        self.stdout.write(f'  Email:   {facility.email or "N/A"}')
        self.stdout.write(f'  Address: {facility.address or "N/A"}')
        self.stdout.write(f'  Active:  {"Yes" if facility.is_active else "No"}')
