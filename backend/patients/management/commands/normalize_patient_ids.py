from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Exists, OuterRef

from patients.dependent_ids import planned_dependent_patient_ids, sync_dependent_patient_ids
from patients.models import Patient


class Command(BaseCommand):
    help = (
        "Normalize dependent patient IDs to ED-/RD- format based on each "
        "principal's category and personal number."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--principal-id",
            type=int,
            default=None,
            help="Only normalize dependents for this principal patient PK.",
        )
        parser.add_argument(
            "--patient-id",
            type=str,
            default=None,
            help="Only normalize dependents for this principal patient_id (e.g. R-9697).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show planned ID changes without writing to the database.",
        )

    def handle(self, *args, **options):
        principal_id = options.get("principal_id")
        patient_id = (options.get("patient_id") or "").strip()
        dry_run = options.get("dry_run", False)

        principals = Patient.objects.filter(
            category__in=["employee", "retiree"],
            merged_into__isnull=True,
        )

        if principal_id is None and not patient_id:
            principals = principals.filter(
                Exists(
                    Patient.objects.filter(
                        category="dependent",
                        principal_staff_id=OuterRef("pk"),
                        merged_into__isnull=True,
                    )
                )
            )

        if principal_id is not None:
            principals = principals.filter(pk=principal_id)
        if patient_id:
            principals = principals.filter(patient_id__iexact=patient_id)

        if principal_id is not None or patient_id:
            if not principals.exists():
                target = f"id={principal_id}" if principal_id is not None else f"patient_id={patient_id}"
                self.stderr.write(
                    self.style.ERROR(f"No principal patient found with {target}.")
                )
                return

        principals = principals.order_by("id")

        updated_dependents = 0
        principals_touched = 0
        skipped_principals = 0
        errors = 0

        for principal in principals:
            planned = planned_dependent_patient_ids(principal)
            if not planned:
                skipped_principals += 1
                continue

            changes = [(dep.id, dep.patient_id, target) for dep, target in planned if dep.patient_id != target]
            if not changes:
                continue

            principals_touched += 1
            label = f"{principal.patient_id} ({principal.get_full_name()})"

            if dry_run:
                self.stdout.write(f"[dry-run] {label}:")
                for dep_id, old_id, new_id in changes:
                    self.stdout.write(f"  dependent {dep_id}: {old_id} -> {new_id}")
                updated_dependents += len(changes)
                continue

            try:
                with transaction.atomic():
                    count = sync_dependent_patient_ids(principal)
                updated_dependents += count
                self.stdout.write(f"Updated {count} dependent(s) for {label}")
            except Exception as exc:
                errors += 1
                self.stderr.write(f"Failed principal {principal.id} ({label}): {exc}")

        mode = "Dry run" if dry_run else "Normalization"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode} complete. Principals touched: {principals_touched}, "
                f"dependents updated: {updated_dependents}, "
                f"principals skipped (no PN/deps): {skipped_principals}, errors: {errors}"
            )
        )
