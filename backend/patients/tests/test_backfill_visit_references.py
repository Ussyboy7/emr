"""Tests for the backfill_visit_references management command."""
from django.core.management import call_command
from django.test import TestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom, ConsultationSession
from patients.models import Visit
from physiotherapy.models import PhysioOrder


class BackfillVisitReferencesCommandTests(TestCase):
    def setUp(self):
        self.doctor = create_test_user("backfill_dr", superuser=True)
        self.patient, self.visit = create_test_patient_visit(patient_id="BACKFILL-001")

    def _make_session(self, visit):
        room = ConsultationRoom.objects.create(name="Backfill Room", room_number="BF-R1")
        return ConsultationSession.objects.create(
            room=room,
            patient=visit.patient,
            visit=visit,
            doctor=self.doctor,
            status="completed",
        )

    def _order_without_visit(self, *, via_session=True, admission=None, date_field_value=None):
        order = PhysioOrder.objects.create(
            patient=self.patient,
            consultation_session=self._make_session(self.visit) if via_session else None,
            admission=admission,
            ordered_by=self.doctor,
            diagnosis="Lumbar strain",
            status="pending",
        )
        if date_field_value is not None:
            PhysioOrder.objects.filter(pk=order.pk).update(ordered_at=date_field_value)
        return PhysioOrder.objects.get(pk=order.pk)

    def test_dry_run_does_not_write(self):
        order = self._order_without_visit(via_session=True)
        self.assertIsNone(order.visit_id)

        call_command("backfill_visit_references")

        self.assertIsNone(PhysioOrder.objects.get(pk=order.pk).visit_id)

    def test_resolves_via_consultation_session(self):
        order = self._order_without_visit(via_session=True)
        call_command("backfill_visit_references", "--commit")
        self.assertEqual(PhysioOrder.objects.get(pk=order.pk).visit_id, self.visit.pk)

    def test_resolves_via_single_same_date_visit(self):
        order = self._order_without_visit(via_session=False, date_field_value=self.visit.date)
        self.assertIsNone(order.visit_id)
        call_command("backfill_visit_references", "--commit")
        self.assertEqual(PhysioOrder.objects.get(pk=order.pk).visit_id, self.visit.pk)

    def test_skips_ambiguous_same_date_visits(self):
        other_visit = Visit.objects.create(
            patient=self.patient,
            date=self.visit.date,
            time=self.visit.time,
            status="in_progress",
            visit_type="consultation",
            clinic="Physiotherapy",
        )
        order = self._order_without_visit(via_session=False, date_field_value=self.visit.date)
        call_command("backfill_visit_references", "--commit")
        self.assertIsNone(PhysioOrder.objects.get(pk=order.pk).visit_id)