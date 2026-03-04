from django.core.management.base import BaseCommand

from pharmacy.models import GenericMedication, Medication


class Command(BaseCommand):
    help = "Normalize pharmacy generic and brand fields to single strength/form/route values."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without saving.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))

        def first_option(value: str) -> str:
            raw = (value or "").strip()
            if not raw or raw in {"-", "N/A", "n/a"}:
                return ""
            return raw.replace(";", ",").split(",")[0].strip()

        def infer_route(dosage_form: str) -> str:
            f = (dosage_form or "").strip().lower()
            if not f:
                return ""
            if any(k in f for k in ["tablet", "capsule", "syrup", "suspension", "powder", "sachet", "solution"]):
                return "Oral"
            if any(k in f for k in ["injection", "vial", "ampoule", "infusion"]):
                return "IV"
            if any(k in f for k in ["inhaler", "nebul"]):
                return "Inhalation"
            if any(k in f for k in ["cream", "ointment", "gel", "lotion"]):
                return "Topical"
            if "eye" in f or "ophthalmic" in f:
                return "Ophthalmic"
            if "ear" in f or "otic" in f:
                return "Otic"
            if "nasal" in f:
                return "Nasal"
            if "suppository" in f:
                return "Rectal"
            return ""

        generics_updated = 0
        brands_updated = 0

        for generic in GenericMedication.objects.all():
            old_strength = generic.strength or ""
            old_form = generic.dosage_form or ""
            old_route = generic.route or ""
            new_strength = first_option(old_strength)
            new_form = first_option(old_form)
            if not new_form:
                fallback_form = (
                    Medication.objects.filter(generic=generic)
                    .exclude(form__isnull=True)
                    .exclude(form="")
                    .values_list("form", flat=True)
                    .first()
                )
                new_form = first_option(fallback_form or "")
            new_route = first_option(old_route) or infer_route(new_form) or "Oral"

            if (new_strength, new_form, new_route) != (old_strength, old_form, old_route):
                generics_updated += 1
                if not dry_run:
                    generic.strength = new_strength
                    generic.dosage_form = new_form
                    generic.route = new_route
                    generic.save(update_fields=["strength", "dosage_form", "route", "updated_at"])

        for brand in Medication.objects.select_related("generic").all():
            old_strength = brand.strength or ""
            old_form = brand.form or ""
            old_generic_name = brand.generic_name or ""
            new_strength = (
                first_option(old_strength)
                or first_option(getattr(brand.generic, "strength", "") or "")
                or "N/A"
            )
            new_form = first_option(old_form) or first_option(getattr(brand.generic, "dosage_form", "") or "")
            new_generic_name = brand.generic.name if brand.generic else old_generic_name

            if (new_strength, new_form, new_generic_name) != (old_strength, old_form, old_generic_name):
                brands_updated += 1
                if not dry_run:
                    brand.strength = new_strength
                    brand.form = new_form
                    brand.generic_name = new_generic_name
                    brand.save(update_fields=["strength", "form", "generic_name", "updated_at"])

        action = "Would normalize" if dry_run else "Normalized"
        self.stdout.write(self.style.SUCCESS(f"{action} generics: {generics_updated}"))
        self.stdout.write(self.style.SUCCESS(f"{action} brands: {brands_updated}"))
