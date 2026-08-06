"""
One-off backfill: ensure every clinic-owning record and account has a clinic.

Strategy (mirrors organization/migrations/0006):
  - Parent-first: derive `location_clinic` from the record's parent chain
    (consultation_session > visit > patient; external manual orders use
    external_clinic).
  - Bode Thomas fallback for true orphans (no resolvable parent).
  - Isolated users (no home clinic, no M2M assignment) -> Bode Thomas.

Run: python manage.py backfill_clinic_attribution [--dry-run]
"""
from django.core.management.base import BaseCommand
from accounts.models import User
from organization.models import Clinic
from consultation.models import ConsultationSession
from pharmacy.models import (
    Prescription, MedicationInventory, HodStockIssue, DispensaryReceiptLine,
)
from laboratory.models import LabOrder
from radiology.models import RadiologyOrder
from eyecare.models import EyeOrder
from physiotherapy.models import PhysioOrder
from nursing.models import NursingOrder
from patients.models import Patient, Visit

BODE_CODE = "BODE-THOMAS"
REL = {
    Prescription: ["consultation_session__visit", "visit"],
    EyeOrder: ["consultation_session__visit", "visit"],
    PhysioOrder: ["consultation_session__visit", "visit"],
    NursingOrder: ["consultation_session__visit", "visit"],
    LabOrder: ["external_clinic", "consultation_session__visit", "visit"],
    RadiologyOrder: ["external_clinic", "consultation_session__visit", "visit"],
}


def resolve_for_order(obj):
    if getattr(obj, "source_type", None) == "external_manual" and getattr(
        obj, "external_clinic_id", None
    ):
        return obj.external_clinic
    if obj.consultation_session_id:
        sess = obj.consultation_session
        if sess.visit_id and sess.visit.location_clinic_id:
            return sess.visit.location_clinic
    if obj.visit_id and obj.visit.location_clinic_id:
        return obj.visit.location_clinic
    return None


class Command(BaseCommand):
    help = "Backfill clinic attribution for records/users missing a clinic (parent-first, Bode fallback)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        bode = Clinic.objects.get(code=BODE_CODE)
        updated = bode_fallback = 0

        def assign(obj, field, clinic):
            nonlocal updated, bode_fallback
            clinic = clinic or bode
            if clinic is bode:
                bode_fallback += 1
            if not dry_run:
                setattr(obj, field, clinic)
                obj.save(update_fields=[field])
            updated += 1

        # 1. Isolated activated users -> Bode Thomas (home + M2M)
        isolated = list(
            User.objects.filter(is_active=True, location_clinic__isnull=True)
            .exclude(location_clinics__isnull=False)
            .distinct()
        )
        if not dry_run:
            for user in isolated:
                user.location_clinic = bode
                user.save(update_fields=["location_clinic"])
                user.location_clinics.add(bode)
        self.stdout.write(f"users to upsert -> Bode: {len(isolated)}" + (" (dry-run)" if dry_run else ""))

        # 2. Parent-first backfills, in dependency order
        for patient in Patient.objects.filter(location_clinic__isnull=True):
            assign(patient, "location_clinic", None)

        for visit in Visit.objects.filter(location_clinic__isnull=True).select_related("patient"):
            src = visit.patient.location_clinic if visit.patient_id else None
            assign(visit, "location_clinic", src)

        for session in ConsultationSession.objects.filter(location_clinic__isnull=True).select_related("visit"):
            src = session.visit.location_clinic if session.visit_id else None
            assign(session, "location_clinic", src)

        for model, rels in REL.items():
            qs = model.objects.filter(location_clinic__isnull=True).select_related(*rels)
            for obj in qs:
                assign(obj, "location_clinic", resolve_for_order(obj))

        for model in (MedicationInventory, HodStockIssue, DispensaryReceiptLine):
            for obj in model.objects.filter(location_clinic__isnull=True):
                assign(obj, "location_clinic", None)

        tag = " (DRY RUN - no writes)" if dry_run else ""
        self.stdout.write(self.style.SUCCESS(
            f"backfilled={updated} bode_fallback={bode_fallback}{tag}"
        ))