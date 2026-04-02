from django.core.management.base import BaseCommand
from django.db import transaction

from pharmacy.models import Dispense


class Command(BaseCommand):
    help = (
        "Repair corrupted dispense rows where wrong batch medication was saved "
        "instead of the prescription item's selected medication."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply updates. Without this flag, runs in dry-run mode.",
        )
        parser.add_argument(
            "--prescription-ids",
            nargs="+",
            type=int,
            help="Optional list of Prescription DB IDs to limit the repair scope.",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options.get("apply"))
        prescription_ids = options.get("prescription_ids") or []

        rows = (
            Dispense.objects.select_related(
                "prescription",
                "prescription_item",
                "prescription_item__medication",
                "medication",
            )
            .filter(dispense_context_snapshot="substituted")
            .order_by("prescription_id", "dispensed_at", "id")
        )
        if prescription_ids:
            rows = rows.filter(prescription_id__in=prescription_ids)

        candidates = []
        for disp in rows:
            item = disp.prescription_item
            if not item or not item.medication_id:
                continue
            if disp.medication_id == item.medication_id:
                continue

            # Safety check: only touch rows where the snapshot still points
            # to the original prescription-item medication.
            item_med_name = getattr(item.medication, "name", "") or ""
            snap_med_name = (disp.prescribed_medication_name_snapshot or "").strip()
            if snap_med_name and item_med_name and snap_med_name != item_med_name:
                continue

            candidates.append(disp)

        self.stdout.write(f"Found {len(candidates)} mismatched dispense row(s).")
        if not candidates:
            return

        for disp in candidates:
            item = disp.prescription_item
            self.stdout.write(
                f"- {disp.dispense_id} | rx={disp.prescription_id} | item={disp.prescription_item_id} "
                f"| dispensed={getattr(disp.medication, 'name', '')} -> {getattr(item.medication, 'name', '')}"
            )

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING("Dry run complete. Re-run with --apply to persist changes.")
            )
            return

        updated = 0
        with transaction.atomic():
            for disp in candidates:
                item = disp.prescription_item
                disp.medication = item.medication
                disp.prescribed_generic_name_snapshot = getattr(item.generic, "name", "") or ""
                disp.prescribed_medication_name_snapshot = getattr(item.medication, "name", "") or ""
                disp.prescribed_unit_snapshot = item.unit or ""
                disp.dispense_context_snapshot = "as_selected_brand"
                if getattr(item.medication, "unit", None):
                    disp.unit = item.medication.unit
                disp.save(
                    update_fields=[
                        "medication",
                        "prescribed_generic_name_snapshot",
                        "prescribed_medication_name_snapshot",
                        "prescribed_unit_snapshot",
                        "dispense_context_snapshot",
                        "unit",
                    ]
                )
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Updated {updated} dispense row(s)."))
