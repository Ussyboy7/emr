"""Backfill missing PhysioOrder rows and reopen visits closed too early."""
from django.core.management.base import BaseCommand
from django.db.models import Q

from patients.models import Visit
from patients.nursing_leg_status import is_physio_clinic, visit_service_clinics
from physiotherapy.models import PhysioOrder
from physiotherapy.visit_orders import (
    ensure_physio_order_for_visit,
    reopen_visit_if_physio_leg_open,
    visit_has_physio_clinic,
)


class Command(BaseCommand):
    help = (
        "Create missing PhysioOrder rows for visits that include Physiotherapy "
        "and reopen visits that were marked completed before the physio leg finished."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--visit-id", type=str, default="", help="Filter by visit_id string")
        parser.add_argument("--patient-id", type=str, default="", help="Filter by patient_id e.g. E-A1687")
        parser.add_argument("--date", type=str, default="", help="Visit date YYYY-MM-DD")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        visit_id = (options.get("visit_id") or "").strip()
        patient_id = (options.get("patient_id") or "").strip()
        date = (options.get("date") or "").strip()

        qs = Visit.objects.select_related("patient").filter(
            Q(clinic__icontains="physio") | Q(clinics__contains=["Physiotherapy"])
        )
        if visit_id:
            qs = qs.filter(visit_id=visit_id)
        if patient_id:
            qs = qs.filter(patient__patient_id=patient_id)
        if date:
            qs = qs.filter(date=date)

        created_orders = 0
        reopened = 0
        skipped = 0

        from django.contrib.auth import get_user_model

        User = get_user_model()
        actor = User.objects.filter(is_superuser=True, is_active=True).order_by("id").first()

        for visit in qs.order_by("-date", "-id"):
            if not visit_has_physio_clinic(visit):
                skipped += 1
                continue

            has_order = PhysioOrder.objects.filter(
                visit_id=visit.id,
                patient_id=visit.patient_id,
            ).exclude(status="cancelled").exists()

            pending_physio = any(
                is_physio_clinic(c) and c not in (visit.completed_clinics or [])
                for c in visit_service_clinics(visit)
            )

            if has_order and not (visit.status == "completed" and pending_physio):
                skipped += 1
                continue

            label = f"{visit.visit_id} ({visit.patient.get_full_name()}) status={visit.status}"

            if dry_run:
                if not has_order:
                    self.stdout.write(f"[dry-run] would create physio order for {label}")
                    created_orders += 1
                if visit.status == "completed" and pending_physio:
                    self.stdout.write(f"[dry-run] would reopen visit {label}")
                    reopened += 1
                continue

            if not has_order:
                if actor is None:
                    self.stderr.write("No superuser found to attribute orders.")
                    return
                order, was_created = ensure_physio_order_for_visit(
                    visit,
                    ordered_by=actor,
                    referral_source="repair",
                )
                if was_created and order:
                    created_orders += 1
                    self.stdout.write(self.style.SUCCESS(f"created physio order {order.id} for {label}"))

            if reopen_visit_if_physio_leg_open(visit):
                visit.save(update_fields=["status"])
                reopened += 1
                self.stdout.write(self.style.SUCCESS(f"reopened visit {label}"))

        mode = "Dry run" if dry_run else "Repair"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode} complete. orders_created={created_orders}, visits_reopened={reopened}, skipped={skipped}"
            )
        )
