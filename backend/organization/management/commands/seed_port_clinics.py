from django.core.management.base import BaseCommand
from organization.models import Clinic


PORTS = [
    {"name": "Lagos Port Complex", "code": "LAGOS-PORT", "location": "Apapa, Lagos"},
    {"name": "Tin Can Island Port Complex", "code": "TIN-CAN", "location": "Tin Can Island, Lagos"},
    {"name": "Rivers Port Complex", "code": "RIVERS-PORT", "location": "Port Harcourt, Rivers"},
    {"name": "Onne Port Complex", "code": "ONNE-PORT", "location": "Onne, Rivers"},
    {"name": "Delta Ports", "code": "DELTA-PORTS", "location": "Warri, Delta"},
    {"name": "Calabar Port", "code": "CALABAR-PORT", "location": "Calabar, Cross River"},
    {"name": "Lekki Deep Sea Port", "code": "LEKKI-PORT", "location": "Lekki, Lagos"},
    {"name": "Headquarters Marina", "code": "HQ-MARINA", "location": "Marina, Lagos"},
]


class Command(BaseCommand):
    help = "Seed port complex locations as Clinics"

    def handle(self, *args, **options):
        created = 0
        for port in PORTS:
            _, was_created = Clinic.objects.get_or_create(
                code=port["code"],
                defaults={
                    "name": port["name"],
                    "location": port["location"],
                    "is_active": True,
                },
            )
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"Created: {port['name']}"))

        if created:
            self.stdout.write(self.style.SUCCESS(f"\n{created} port clinics created"))
        else:
            self.stdout.write("All port clinics already exist")
