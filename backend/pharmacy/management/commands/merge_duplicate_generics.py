"""
Merge duplicate GenericMedication records (same name + same strength after normalizing).
Keeps one generic per (name, normalized_strength, form), reassigns all brands to it, deletes duplicates.

Usage:
  Dry run (default):  python manage.py merge_duplicate_generics
  Actually merge:     python manage.py merge_duplicate_generics --commit
  Docker:             docker exec emr-backend-local python manage.py merge_duplicate_generics --commit
"""
import re
from collections import defaultdict
from django.core.management.base import BaseCommand
from django.db import transaction
from pharmacy.models import GenericMedication, Medication


def normalize_strength(s: str) -> str:
    """Normalize strength for comparison so '10/160/12.5mg' and '10mg/160mg/12.5mg' match."""
    if not s or not isinstance(s, str):
        return ""
    s = s.strip().lower()
    # Remove common units (order matters: mcg before mg) so we compare number structure only
    for unit in ("mcg", "mg", "ml", "iu", "u", "g", "%"):
        s = s.replace(unit, "")
    # Normalize slashes and spaces
    s = re.sub(r"[\s/]+", "/", s).strip("/ ")
    return s


def normalize_form(s: str) -> str:
    """Normalize dosage form for comparison."""
    if not s or not isinstance(s, str):
        return ""
    return s.strip().lower()


class Command(BaseCommand):
    help = "Merge duplicate GenericMedication records (same name + normalized strength + form)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Actually perform the merge and delete duplicates (default is dry run)",
        )

    def handle(self, *args, **options):
        commit = options.get("commit", False)
        if not commit:
            self.stdout.write(self.style.WARNING("DRY RUN (no changes). Use --commit to apply merge."))

        generics = list(GenericMedication.objects.all().order_by("id"))
        # Group by (name, normalized_strength, normalized_form) so we don't merge different forms (e.g. tablet vs liniment)
        groups = defaultdict(list)
        for g in generics:
            key = (g.name.strip(), normalize_strength(g.strength or ""), normalize_form(g.dosage_form or ""))
            groups[key].append(g)

        to_merge = [(key, gen_list) for key, gen_list in groups.items() if len(gen_list) > 1]
        if not to_merge:
            self.stdout.write(self.style.SUCCESS("No duplicate generics found (same name + normalized strength + form)."))
            return

        self.stdout.write(f"Found {len(to_merge)} group(s) of duplicate generics.\n")

        total_reassigned = 0
        total_deleted = 0

        for (name, norm_str, norm_form), gen_list in sorted(to_merge, key=lambda x: x[0][0]):
            # Sort by id so we keep the smallest id (oldest) as canonical
            gen_list.sort(key=lambda x: x.id)
            keep = gen_list[0]
            duplicates = gen_list[1:]
            self.stdout.write(f"  [{name}] normalized_strength={norm_str!r} normalized_form={norm_form!r}")
            self.stdout.write(f"    KEEP id={keep.id} strength={keep.strength!r} form={keep.dosage_form!r}")

            for dup in duplicates:
                meds = Medication.objects.filter(generic=dup)
                count = meds.count()
                total_reassigned += count
                self.stdout.write(f"    MERGE id={dup.id} strength={dup.strength!r} form={dup.dosage_form!r} → {count} brand(s) → id={keep.id}")
                total_deleted += 1

            if commit:
                with transaction.atomic():
                    for dup in duplicates:
                        Medication.objects.filter(generic=dup).update(generic=keep)
                        dup.delete()

        self.stdout.write("")
        if commit:
            self.stdout.write(self.style.SUCCESS(
                f"Done. Reassigned {total_reassigned} medication(s) to kept generics; removed {total_deleted} duplicate generic(s)."
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f"Would reassign {total_reassigned} medication(s) and remove {total_deleted} duplicate generic(s). Run with --commit to apply."
            ))
