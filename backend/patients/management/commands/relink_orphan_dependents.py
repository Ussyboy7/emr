"""
Re-link orphan dependents (principal_staff is null) to their principals.

Orphans usually appear after staff→officer promotion when an old dependent row
keeps the -1 patient_id but loses its principal link, while a newer duplicate
is linked as -2. This command merges obvious duplicates into the linked
dependent, or re-parents orphans when the principal has no linked dependents.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from patients.dependent_ids import sync_dependent_patient_ids
from patients.dependent_patient_id import (
    find_principal_for_dependent_id,
    normalize_person_name,
    parse_dependent_patient_id,
)
from patients.merge import merge_patients
from patients.models import Patient

User = get_user_model()


class Command(BaseCommand):
    help = "Re-link orphan dependents to principals (merge duplicates or set principal_staff)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show planned actions without writing to the database.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Process at most this many orphan dependents.",
        )
        parser.add_argument(
            "--orphan-id",
            type=int,
            default=None,
            help="Only process this orphan dependent PK.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        limit = options.get("limit")
        orphan_id = options.get("orphan_id")

        orphans = Patient.objects.filter(
            category="dependent",
            principal_staff__isnull=True,
            is_active=True,
            merged_into__isnull=True,
        ).exclude(patient_id__startswith="MERGED").order_by("patient_id", "id")

        if orphan_id is not None:
            orphans = orphans.filter(pk=orphan_id)
            if not orphans.exists():
                self.stderr.write(self.style.ERROR(f"No orphan dependent found with id={orphan_id}."))
                return

        if limit:
            orphans = orphans[:limit]

        actor = User.objects.filter(is_superuser=True, is_active=True).order_by("id").first()
        if not actor and not dry_run:
            self.stderr.write(self.style.ERROR("No active superuser found to perform merges."))
            return

        merged = 0
        reparented = 0
        skipped = 0
        errors = 0
        principals_to_sync: set[int] = set()

        for orphan in orphans:
            parsed = parse_dependent_patient_id(orphan.patient_id)
            if not parsed:
                skipped += 1
                self.stdout.write(f"skip {orphan.id} {orphan.patient_id}: unrecognized ID format")
                continue

            principal = find_principal_for_dependent_id(orphan.patient_id)
            if not principal:
                skipped += 1
                self.stdout.write(
                    f"skip {orphan.id} {orphan.patient_id} ({orphan.get_full_name()}): principal not found"
                )
                continue

            linked = list(
                Patient.objects.filter(
                    category="dependent",
                    principal_staff=principal,
                    merged_into__isnull=True,
                    is_active=True,
                ).exclude(pk=orphan.pk).order_by("created_at", "id")
            )

            orphan_name = normalize_person_name(orphan)

            if linked:
                winner = None
                for candidate in linked:
                    if normalize_person_name(candidate) == orphan_name:
                        winner = candidate
                        break
                winner = winner or linked[0]
                label = (
                    f"merge orphan {orphan.id} ({orphan.patient_id}) "
                    f"into {winner.id} ({winner.patient_id}) for {principal.patient_id}"
                )
                if dry_run:
                    self.stdout.write(f"[dry-run] {label}")
                    merged += 1
                    principals_to_sync.add(principal.id)
                    continue
                try:
                    with transaction.atomic():
                        merge_patients(
                            winner_id=winner.id,
                            loser_id=orphan.id,
                            user=actor,
                            reason="Re-link orphan dependent during data cleanup",
                        )
                    merged += 1
                    principals_to_sync.add(principal.id)
                    self.stdout.write(self.style.SUCCESS(label))
                except Exception as exc:
                    errors += 1
                    self.stderr.write(f"failed {label}: {exc}")
                continue

            label = (
                f"reparent orphan {orphan.id} ({orphan.patient_id}) "
                f"to {principal.patient_id} ({principal.get_full_name()})"
            )
            if dry_run:
                self.stdout.write(f"[dry-run] {label}")
                reparented += 1
                principals_to_sync.add(principal.id)
                continue
            try:
                with transaction.atomic():
                    orphan.principal_staff = principal
                    orphan.save(update_fields=["principal_staff"])
                reparented += 1
                principals_to_sync.add(principal.id)
                self.stdout.write(self.style.SUCCESS(label))
            except Exception as exc:
                errors += 1
                self.stderr.write(f"failed {label}: {exc}")

        if not dry_run and principals_to_sync:
            self.stdout.write("Syncing dependent patient IDs for touched principals…")
            for principal_pk in sorted(principals_to_sync):
                principal = Patient.objects.filter(pk=principal_pk).first()
                if not principal:
                    continue
                try:
                    count = sync_dependent_patient_ids(principal)
                    if count:
                        self.stdout.write(
                            f"  synced {count} dependent ID(s) for {principal.patient_id}"
                        )
                except Exception as exc:
                    errors += 1
                    self.stderr.write(f"  sync failed for principal {principal_pk}: {exc}")

        mode = "Dry run" if dry_run else "Re-link"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode} complete. merged={merged}, reparented={reparented}, "
                f"skipped={skipped}, principals_to_sync={len(principals_to_sync)}, errors={errors}"
            )
        )
