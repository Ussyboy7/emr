"""Backfill lab sample batches without guessing collection facilities."""
import re

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from laboratory.models import LabOrder, LabSampleBatch
from organization.models import Clinic


class Command(BaseCommand):
    help = "Backfill lab sample batches; default is a non-writing dry run."

    def add_arguments(self, parser):
        modes = parser.add_mutually_exclusive_group()
        modes.add_argument(
            "--dry-run",
            action="store_true",
            help="Report changes without writing them (the default).",
        )
        modes.add_argument(
            "--apply",
            action="store_true",
            help="Persist the proposed sample-batch backfill.",
        )

    @staticmethod
    def _origin_clinic(order):
        candidates = []
        for clinic in (
            getattr(order, "location_clinic", None),
            getattr(getattr(order, "visit", None), "location_clinic", None),
            getattr(order, "external_clinic", None),
        ):
            if clinic is not None and clinic.pk not in {item.pk for item in candidates}:
                candidates.append(clinic)
        if len(candidates) == 1:
            return candidates[0]
        return None

    @staticmethod
    def _existing_accession(order, tests):
        values = {value for value in [order.lab_number, *(test.lab_number for test in tests)] if value}
        if len(values) > 1:
            return None, True
        return (values.pop() if values else None), False

    @staticmethod
    def _accession_prefix(clinic):
        prefix = re.sub(r"[^A-Za-z0-9]+", "-", clinic.code).strip("-").upper()
        return (prefix or "CLINIC")[:12]

    def _next_accession(self, clinic, planned, *, recalculate=False):
        prefix = f"{self._accession_prefix(clinic)}-{timezone.now():%y}-"
        if recalculate or clinic.pk not in planned:
            last = (
                LabSampleBatch.objects
                .filter(accession_number__startswith=prefix)
                .order_by("-accession_number")
                .values_list("accession_number", flat=True)
                .first()
            )
            serial = int(last.rsplit("-", 1)[-1]) if last else 0
            planned[clinic.pk] = serial
        planned[clinic.pk] += 1
        return f"{prefix}{planned[clinic.pk]:04d}"

    def handle(self, *args, **options):
        apply_mode = options["apply"]
        counts = {key: 0 for key in ("created", "preserved", "skipped", "ambiguous")}
        planned = {}
        details = []
        orders = (
            LabOrder.objects
            .select_related("location_clinic", "visit__location_clinic", "external_clinic")
            .prefetch_related("tests")
            .order_by("pk")
        )

        for order in orders.iterator(chunk_size=200):
            if apply_mode:
                with transaction.atomic():
                    LabOrder.objects.select_for_update().get(pk=order.pk)
                    locked_order = LabOrder.objects.select_related(
                        "location_clinic",
                        "visit__location_clinic",
                        "external_clinic",
                    ).get(pk=order.pk)
                    tests = [
                        test
                        for test in locked_order.tests.all()
                        if test.sample_batch_id is None
                    ]
                    if not tests:
                        counts["skipped"] += 1
                        continue

                    accession, accession_conflict = self._existing_accession(
                        locked_order, tests
                    )
                    clinic = self._origin_clinic(locked_order)
                    if clinic is None or accession_conflict:
                        counts["ambiguous"] += 1
                        reason = (
                            "collection facility unresolved"
                            if clinic is None
                            else "legacy accessions conflict"
                        )
                        details.append(
                            f"  ambiguous: {locked_order.order_id} ({reason})"
                        )
                        continue

                    if accession:
                        counts["preserved"] += 1
                    else:
                        # Serialize generated serials per collection clinic and
                        # recalculate after acquiring the row lock.
                        clinic = Clinic.objects.select_for_update().get(pk=clinic.pk)
                        accession = self._next_accession(
                            clinic, planned, recalculate=True
                        )

                    existing_batch = LabSampleBatch.objects.filter(
                        order=locked_order,
                        accession_number=accession,
                    ).first()
                    if existing_batch is not None:
                        counts["skipped"] += 1
                        continue

                    if LabSampleBatch.objects.filter(
                        accession_number=accession
                    ).exists():
                        counts["ambiguous"] += 1
                        details.append(
                            f"  ambiguous: {locked_order.order_id} "
                            "(accession already belongs to another order)"
                        )
                        continue

                    counts["created"] += 1
                    batch = LabSampleBatch.objects.create(
                        order=locked_order,
                        collection_clinic=clinic,
                        accession_number=accession,
                    )
                    for test in tests:
                        test.sample_batch = batch
                        if not test.lab_number:
                            test.lab_number = accession
                        test.save(update_fields=["sample_batch", "lab_number", "updated_at"])
                continue

            tests = [test for test in order.tests.all() if test.sample_batch_id is None]
            if not tests:
                counts["skipped"] += 1
                continue

            accession, accession_conflict = self._existing_accession(order, tests)
            clinic = self._origin_clinic(order)
            if clinic is None or accession_conflict:
                counts["ambiguous"] += 1
                reason = "collection facility unresolved" if clinic is None else "legacy accessions conflict"
                details.append(f"  ambiguous: {order.order_id} ({reason})")
                continue

            if accession:
                counts["preserved"] += 1

            if not accession:
                accession = self._next_accession(clinic, planned)

            existing_batch = LabSampleBatch.objects.filter(
                order=order,
                accession_number=accession,
            ).first()
            if existing_batch is not None:
                counts["skipped"] += 1
                continue

            if LabSampleBatch.objects.filter(accession_number=accession).exists():
                counts["ambiguous"] += 1
                details.append(f"  ambiguous: {order.order_id} (accession already belongs to another order)")
                continue

            counts["created"] += 1

        mode = "APPLY" if apply_mode else "DRY RUN"
        self.stdout.write(f"{mode} backfill_sample_batches")
        self.stdout.write(
            "Counts: " + ", ".join(f"{key}: {value}" for key, value in counts.items())
        )
        for detail in details:
            self.stdout.write(detail)
