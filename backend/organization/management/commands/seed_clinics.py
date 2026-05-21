from django.core.management.base import BaseCommand
from organization.models import Clinic, OutpatientClinicType, FacilityOutpatientClinic


CLINICS = [
    {"name": "Bode Thomas Clinic", "code": "BODE-THOMAS", "location": "Bode Thomas, Surulere, Lagos", "phone": "+234-1-1234567", "email": "bode.thomas@npa.gov.ng"},
    {"name": "Tincan Island Port Clinic", "code": "TINCAN", "location": "Tincan Island Port, Lagos", "phone": "+234-1-2345678", "email": "tincan.clinic@npa.gov.ng"},
    {"name": "Apapa Port Clinic", "code": "APAPA", "location": "Apapa Port Complex, Lagos", "phone": "+234-1-3456789", "email": "apapa.clinic@npa.gov.ng"},
    {"name": "Rivers Port Clinic", "code": "RIVERS", "location": "Rivers Port Complex, Port Harcourt", "phone": "+234-84-123456", "email": "rivers.clinic@npa.gov.ng"},
    {"name": "Onne Port Clinic", "code": "ONNE", "location": "Onne Port Complex, Rivers", "phone": "+234-84-234567", "email": "onne.clinic@npa.gov.ng"},
    {"name": "Delta Port Clinic", "code": "DELTA", "location": "Delta Ports, Warri", "phone": "+234-53-123456", "email": "delta.clinic@npa.gov.ng"},
    {"name": "Calabar Port Clinic", "code": "CALABAR", "location": "Calabar Port, Cross River", "phone": "+234-87-123456", "email": "calabar.clinic@npa.gov.ng"},
    {"name": "Lekki Port Clinic", "code": "LEKKI", "location": "Lekki Deep Sea Port, Lagos", "phone": "+234-1-4567890", "email": "lekki.clinic@npa.gov.ng"},
    {"name": "HQ Clinic (Marina)", "code": "HQ-MARINA", "location": "NPA Headquarters, Marina, Lagos", "phone": "+234-1-5678901", "email": "hq.clinic@npa.gov.ng"},
]


class Command(BaseCommand):
    help = "Seed NPA port clinics"

    def handle(self, *args, **options):
        try:
            bode_thomas = Clinic.objects.get(code="BODE-THOMAS")
        except Clinic.DoesNotExist:
            bode_thomas = None

        touched = 0
        for data in CLINICS:
            defaults = {
                "name": data["name"],
                "location": data.get("location", ""),
                "phone": data.get("phone", ""),
                "email": data.get("email", ""),
                "default_processing_clinic": bode_thomas if data["code"] != "BODE-THOMAS" else None,
            }
            clinic, created = Clinic.objects.update_or_create(
                code=data["code"],
                defaults=defaults,
            )
            touched += 1
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created: {clinic.name} ({clinic.code})"))
            else:
                self.stdout.write(f"Updated: {clinic.name} ({clinic.code})")

        self.stdout.write(self.style.SUCCESS(f"\n{touched} clinics seeded"))

        # Seed OPD service types for all clinics
        all_types = list(OutpatientClinicType.objects.filter(is_active=True).order_by("sort_order", "name"))
        linked = 0
        for clinic in Clinic.objects.filter(is_active=True):
            for sort_idx, oct in enumerate(all_types):
                _, was_created = FacilityOutpatientClinic.objects.get_or_create(
                    facility=clinic,
                    clinic_type=oct,
                    defaults={"sort_order": sort_idx, "is_active": True},
                )
                if was_created:
                    linked += 1

        if linked:
            self.stdout.write(self.style.SUCCESS(f"{linked} OPD type links created"))
        else:
            self.stdout.write("All OPD types already linked")
