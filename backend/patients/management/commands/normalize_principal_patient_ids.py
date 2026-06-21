from django.core.management.base import BaseCommand

from patients.models import Patient
from patients.principal_ids import (
    normalize_principal_patient,
    principal_normalization_plan,
    principals_needing_normalization,
)


class Command(BaseCommand):
    help = (
        "Normalize employee/retiree principal records to canonical patient_id "
        "format (E-{pn}, R-{pn}) and strip redundant prefixes from personal_number."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show planned changes without writing to the database.",
        )
        parser.add_argument(
            "--patient-id",
            type=str,
            default=None,
            help="Only normalize this principal patient_id (e.g. R-R-88297).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Process at most this many principals.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        patient_id = (options.get("patient_id") or "").strip()
        limit = options.get("limit")

        principals = principals_needing_normalization()
        if patient_id:
            principals = principals.filter(patient_id__iexact=patient_id)
            if not principals.exists():
                self.stderr.write(
                    self.style.ERROR(f"No principal patient found with patient_id={patient_id}.")
                )
                return

        updated = 0
        errors = 0
        processed = 0

        for principal in principals:
            plan = principal_normalization_plan(principal)
            if not plan:
                continue
            if limit is not None and processed >= limit:
                break
            processed += 1

            canonical_pn, canonical_id = plan
            label = (
                f"{principal.patient_id} ({principal.get_full_name()}): "
                f"PN {(principal.personal_number or '').strip()!r} -> {canonical_pn!r}, "
                f"patient_id -> {canonical_id}"
            )

            if dry_run:
                self.stdout.write(f"[dry-run] {label}")
                updated += 1
                continue

            try:
                if normalize_principal_patient(principal):
                    updated += 1
                    self.stdout.write(self.style.SUCCESS(f"normalized {label}"))
            except Exception as exc:
                errors += 1
                self.stderr.write(f"failed {label}: {exc}")

        mode = "Dry run" if dry_run else "Normalization"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode} complete. candidates={processed}, updated={updated}, errors={errors}"
            )
        )
