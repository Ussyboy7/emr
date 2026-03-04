from django.core.management.base import BaseCommand

from pharmacy.models import GenericMedication, Medication


def first_option(value: str) -> str:
    raw = (value or "").strip()
    if not raw or raw in {"-", "N/A", "n/a"}:
        return ""
    return raw.replace(";", ",").split(",")[0].strip()


def infer_route(dosage_form: str) -> str:
    f = (dosage_form or "").strip().lower()
    if not f:
        return "Oral"
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
    return "Oral"


class Command(BaseCommand):
    help = "Create/assign generic variants from brand strength/form and relink brands to matching variants."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without saving.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))

        created_variants = 0
        relinked_brands = 0

        brands = Medication.objects.select_related("generic").all().order_by("id")
        for brand in brands:
            base_generic = brand.generic
            name_final = (brand.generic_name or (base_generic.name if base_generic else "")).strip()
            if not name_final:
                continue

            strength_final = first_option(brand.strength) or first_option(base_generic.strength if base_generic else "") or "N/A"
            form_final = first_option(brand.form) or first_option(base_generic.dosage_form if base_generic else "")
            if not form_final:
                continue
            route_final = first_option(base_generic.route if base_generic else "") or infer_route(form_final)

            target = GenericMedication.objects.filter(
                name__iexact=name_final,
                strength=strength_final,
                dosage_form__iexact=form_final,
            ).order_by("id").first()

            if not target:
                atc_for_create = None
                if base_generic and base_generic.atc_code and not GenericMedication.objects.filter(atc_code=base_generic.atc_code).exists():
                    atc_for_create = base_generic.atc_code
                if not dry_run:
                    target = GenericMedication.objects.create(
                        name=name_final,
                        active_ingredient=(base_generic.active_ingredient if base_generic else name_final),
                        category=(base_generic.category if base_generic and base_generic.category else "Other"),
                        strength=strength_final,
                        dosage_form=form_final,
                        route=route_final,
                        atc_code=atc_for_create,
                        is_active=True,
                    )
                created_variants += 1

            if target and (brand.generic_id != target.id or brand.generic_name != target.name):
                relinked_brands += 1
                if not dry_run:
                    brand.generic = target
                    brand.generic_name = target.name
                    brand.save(update_fields=["generic", "generic_name", "updated_at"])

        action = "Would create/relink" if dry_run else "Created/relinked"
        self.stdout.write(self.style.SUCCESS(f"{action} generic variants: {created_variants}"))
        self.stdout.write(self.style.SUCCESS(f"{action} brand links: {relinked_brands}"))
