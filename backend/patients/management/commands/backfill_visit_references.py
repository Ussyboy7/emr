"""
One-time backfill of missing visit references on legacy clinical records.

Attribution priority (only write when unambiguous):
  1. record.consultation_session.visit  (orders created from a consultation)
  2. record.admission.visit              (orders created from a ward admission)
  3. a single same-date visit for the record's patient (date-window fallback)

Records that resolve to more than one candidate are left untouched and counted.
Default is a dry run; pass --commit to write changes.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from consultation.models import ConsultationSession, Referral
from eyecare.models import EyeOrder
from laboratory.models import LabOrder
from patients.models import Visit, VitalReading
from pharmacy.models import Prescription
from physiotherapy.models import PhysioOrder
from radiology.models import RadiologyOrder


class Command(BaseCommand):
    help = __doc__.strip().splitlines()[0]

    def add_arguments(self, parser):
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Persist backfilled visit references (default is a dry run).",
        )

    # Scope: (model, human label, timestamp field, consultation-link field name or None).
    scopes = [
        (PhysioOrder, "physio orders", "ordered_at", "consultation_session"),
        (EyeOrder, "eye orders", "ordered_at", "consultation_session"),
        (LabOrder, "lab orders", "ordered_at", "consultation_session"),
        (RadiologyOrder, "radiology orders", "ordered_at", "consultation_session"),
        (Prescription, "prescriptions", "prescribed_at", "consultation_session"),
        (VitalReading, "vital readings", "recorded_at", None),
        (Referral, "referrals", "referred_at", "session"),
        (ConsultationSession, "consultation sessions", "started_at", None),
    ]

    @staticmethod
    def _has_field(model, field_name):
        try:
            model._meta.get_field(field_name)
            return True
        except Exception:
            return False

    @classmethod
    def _resolve_visit(cls, record, model, date_field, consult_fk):
        """Return (visit_id, channel) where channel is session|admission|date|None."""
        if consult_fk:
            session = getattr(record, consult_fk, None)
            if session is not None and getattr(session, "visit_id", None):
                return session.visit_id, "session"

        if cls._has_field(model, "admission"):
            admission = getattr(record, "admission", None)
            if admission is not None and getattr(admission, "visit_id", None):
                return admission.visit_id, "admission"

        record_dt = getattr(record, date_field, None)
        if record_dt is None:
            return None, None
        record_date = timezone.localtime(record_dt).date()
        same_date = list(
            Visit.objects.filter(patient_id=record.patient_id, date=record_date).values_list("id", flat=True)
        )
        if len(same_date) == 1:
            return same_date[0], "date"
        return None, None

    def handle(self, *args, **options):
        commit = options["commit"]
        rows = []
        totals = {"session": 0, "admission": 0, "date": 0, "skipped": 0}

        for model, label, date_field, consult_fk in self.scopes:
            counts = {"session": 0, "admission": 0, "date": 0, "skipped": 0}

            select = []
            if consult_fk:
                select.append(consult_fk)
                select.append(f"{consult_fk}__visit")
            if self._has_field(model, "admission"):
                select.append("admission")
                select.append("admission__visit")

            qs = model.objects.filter(visit__isnull=True).select_related(*select)

            for record in qs.iterator(chunk_size=200):
                visit_id, channel = self._resolve_visit(record, model, date_field, consult_fk)
                if visit_id is None:
                    counts["skipped"] += 1
                    continue
                counts[channel] += 1
                if commit:
                    model.objects.filter(pk=record.pk).update(visit_id=visit_id)

            rows.append(
                f"{label}: {counts['session']} via session, {counts['admission']} via admission, "
                f"{counts['date']} via date, {counts['skipped']} skipped"
            )
            for key in ("session", "admission", "date", "skipped"):
                totals[key] += counts[key]

        self.stdout.write(f"{'COMMITTED' if commit else 'DRY RUN'} backfill finished ({timezone.now():%Y-%m-%d %H:%M:%S})")
        for line in rows:
            self.stdout.write(f"  {line}")
        self.stdout.write(
            f"Totals: {totals['session']} via session, {totals['admission']} via admission, "
            f"{totals['date']} via date, {totals['skipped']} skipped"
        )