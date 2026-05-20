from django.core.management.base import BaseCommand
from organization.models import WorkLocation


LOCATIONS = [
    "Lagos Port Complex",
    "Tin Can Island Port Complex",
    "Rivers Port Complex",
    "Onne Port Complex",
    "Delta Ports",
    "Calabar Port",
    "Lekki Deep Sea Port",
    "Headquarters Marina",
]


class Command(BaseCommand):
    help = "Seed employee work locations (port complexes)"

    def handle(self, *args, **options):
        created = 0
        for name in LOCATIONS:
            _, was_created = WorkLocation.objects.get_or_create(
                name=name, defaults={"is_active": True}
            )
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"Created: {name}"))

        if created:
            self.stdout.write(self.style.SUCCESS(f"\n{created} work locations created"))
        else:
            self.stdout.write("All work locations already exist")
