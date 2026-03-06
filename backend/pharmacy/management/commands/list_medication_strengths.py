"""
List medications to review multiple strengths and combination drugs.
Usage (Docker): docker exec emr-backend-local python manage.py list_medication_strengths
Optional: python manage.py list_medication_strengths --search "Amlodipine"
"""
from collections import defaultdict
from django.core.management.base import BaseCommand
from pharmacy.models import Medication, GenericMedication


class Command(BaseCommand):
    help = "List medications by name/generic to review multiple strengths and duplicates."

    def add_arguments(self, parser):
        parser.add_argument("--search", type=str, default=None, help="Filter by name/generic containing this (case-insensitive)")
        parser.add_argument("--dupes-only", action="store_true", help="Only show generics or names with multiple strength variants")

    def handle(self, *args, **options):
        search = (options.get("search") or "").strip().lower()
        dupes_only = options.get("dupes_only", False)

        # Brand medications (Medication model)
        qs = Medication.objects.filter(is_active=True).select_related("generic").order_by("generic_name", "name", "strength")
        if search:
            qs = qs.filter(name__icontains=search) | qs.filter(generic_name__icontains=search) | qs.filter(code__icontains=search)

        by_generic = defaultdict(list)
        for m in qs:
            key = (m.generic_name or m.name or "").strip() or "(no name)"
            by_generic[key].append(m)

        self.stdout.write("\n--- Brand medications (Medication) by generic/base name ---\n")
        for name, meds in sorted(by_generic.items()):
            if dupes_only and len(meds) < 2:
                continue
            self.stdout.write(f"  [{name}] → {len(meds)} brand(s)")
            for m in meds:
                gen = f" (generic_id={m.generic_id})" if m.generic_id else ""
                self.stdout.write(f"    id={m.id} code={m.code} name={m.name} strength={m.strength!r} form={m.form!r} unit={m.unit!r}{gen}")
            self.stdout.write("")

        # Generics with multiple strength/form variants
        gen_qs = GenericMedication.objects.all().order_by("name", "strength", "dosage_form")
        if search:
            gen_qs = gen_qs.filter(name__icontains=search)
        by_gen_name = defaultdict(list)
        for g in gen_qs:
            by_gen_name[g.name].append(g)

        self.stdout.write("\n--- Generic medications (GenericMedication) by name ---\n")
        for name, gens in sorted(by_gen_name.items()):
            if dupes_only and len(gens) < 2:
                continue
            self.stdout.write(f"  [{name}] → {len(gens)} variant(s)")
            for g in gens:
                self.stdout.write(f"    id={g.id} strength={g.strength!r} form={g.dosage_form!r} route={g.route!r}")
            self.stdout.write("")

        # Summary: same (name, generic) with different strength = would be duplicate brands
        self.stdout.write("\n--- Summary ---")
        self.stdout.write(f"  Total active brand medications: {Medication.objects.filter(is_active=True).count()}")
        self.stdout.write(f"  Total generics: {GenericMedication.objects.count()}")
        multi = sum(1 for meds in by_generic.values() if len(meds) > 1)
        self.stdout.write(f"  Generic names with multiple brand strengths/variants: {multi}")
