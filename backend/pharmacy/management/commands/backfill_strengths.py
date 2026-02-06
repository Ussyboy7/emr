import re
from django.core.management.base import BaseCommand
from django.db import transaction
from pharmacy.models import Medication, GenericMedication

STRENGTH_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?\s?(?:mg|mcg|g|IU|%)(?:/\d+(?:\.\d+)?\s?(?:mg|mcg|g|IU|%))*(?:/(?:ml|L|spray|dose|vial|ampoule|pen|5ml|10ml))?)",
    re.IGNORECASE,
)

class Command(BaseCommand):
    help = "Backfill missing strength values for brands (from names) and generics (from associated brand strengths)"

    def handle(self, *args, **options):
        updated_brands = 0
        updated_generics = 0

        with transaction.atomic():
            # 1) Brands: derive strength from brand name if missing
            missing_brand_strength = Medication.objects.filter(
                strength__isnull=True
            ) | Medication.objects.filter(strength__exact="") | Medication.objects.filter(strength__exact="-")

            for med in missing_brand_strength:
                match = STRENGTH_PATTERN.search(med.name or "")
                if match:
                    strength = match.group(1).strip()
                    med.strength = strength
                    med.save(update_fields=["strength"])
                    updated_brands += 1

            # 2) Generics: aggregate distinct brand strengths if generic strength missing
            missing_generic_strength = GenericMedication.objects.filter(
                strength__isnull=True
            ) | GenericMedication.objects.filter(strength__exact="") | GenericMedication.objects.filter(strength__exact="-")

            for gen in missing_generic_strength:
                brand_strengths = (
                    Medication.objects.filter(generic=gen)
                    .exclude(strength__isnull=True)
                    .exclude(strength__exact="")
                    .exclude(strength__exact="-")
                    .values_list("strength", flat=True)
                    .distinct()
                )
                strengths = [s.strip() for s in brand_strengths if s and s.strip()]
                if strengths:
                    parts = []
                    for s in sorted(strengths):
                        candidate = (", ".join(parts + [s])).strip()
                        if len(candidate) <= 100:
                            parts.append(s)
                        else:
                            break
                    gen.strength = ", ".join(parts)
                    gen.save(update_fields=["strength"])
                    updated_generics += 1

        self.stdout.write(self.style.SUCCESS(f"Backfilled brand strengths: {updated_brands}"))
        self.stdout.write(self.style.SUCCESS(f"Backfilled generic strengths: {updated_generics}"))
