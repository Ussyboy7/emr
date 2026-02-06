from django.core.management.base import BaseCommand
from pharmacy.models import GenericMedication, Medication

class Command(BaseCommand):
    help = "Audit pharmacy data for missing critical fields (strength, dosage form, pack size)"

    def handle(self, *args, **options):
        missing_generic_strength = GenericMedication.objects.filter(
            strength__isnull=True
        ) | GenericMedication.objects.filter(strength__exact="") | GenericMedication.objects.filter(strength__exact="-")
        missing_generic_form = GenericMedication.objects.filter(
            dosage_form__isnull=True
        ) | GenericMedication.objects.filter(dosage_form__exact="") | GenericMedication.objects.filter(dosage_form__exact="-")

        missing_brand_strength = Medication.objects.filter(
            strength__isnull=True
        ) | Medication.objects.filter(strength__exact="") | Medication.objects.filter(strength__exact="-")
        missing_brand_form = Medication.objects.filter(
            form__isnull=True
        ) | Medication.objects.filter(form__exact="") | Medication.objects.filter(form__exact="-")

        missing_brand_pack = Medication.objects.filter(
            pack_size__isnull=True
        )

        self.stdout.write("\n--- Audit Report ---")
        self.stdout.write(f"Generics missing strength: {missing_generic_strength.count()}")
        self.stdout.write(f"Generics missing dosage_form: {missing_generic_form.count()}")
        self.stdout.write(f"Brands missing strength: {missing_brand_strength.count()}")
        self.stdout.write(f"Brands missing form: {missing_brand_form.count()}")
        self.stdout.write(f"Brands missing pack_size: {missing_brand_pack.count()}")

        def sample(qs, label):
            self.stdout.write(f"\n{label} (sample up to 10):")
            for g in qs[:10]:
                try:
                    name = getattr(g, "name", "?")
                except Exception:
                    name = "?"
                self.stdout.write(f"- {name}")

        sample(missing_generic_strength, "Generics without strength")
        sample(missing_generic_form, "Generics without dosage_form")
        sample(missing_brand_strength, "Brands without strength")
        sample(missing_brand_form, "Brands without form")
        sample(missing_brand_pack, "Brands without pack_size")
