"""Tests for nursing pool stage filtering (apply_nursing_status_filter)."""
from datetime import date, time
from unittest.mock import MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from consultation.models import ConsultationQueue, ConsultationRoom, ConsultationSession
from patients.models import Patient, Visit, VitalReading
from patients.views import apply_nursing_status_filter

User = get_user_model()


def _mock_request(**query_params):
    request = MagicMock()
    request.query_params = query_params
    return request


class NursingStatusFilterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.patient = Patient.objects.create(
            patient_id="NSF-PT-001",
            surname="Pool",
            first_name="Patient",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        cls.room = ConsultationRoom.objects.create(
            name="Room A",
            room_number="NSF-R1",
        )

    def _visit(self, suffix: str, *, status: str = "in_progress") -> Visit:
        return Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(9, 0),
            status=status,
            visit_id=f"NSF-V-{suffix}",
        )

    def _base_qs(self):
        return Visit.objects.filter(patient=self.patient, status="in_progress")

    def test_pending_excludes_visits_with_vitals(self):
        pending_visit = self._visit("pending")
        ready_visit = self._visit("ready")
        VitalReading.objects.create(
            visit=ready_visit,
            patient=self.patient,
            temperature=36.5,
            heart_rate=72,
        )

        ids = set(
            apply_nursing_status_filter(self._base_qs(), "pending", _mock_request()).values_list(
                "id", flat=True
            )
        )
        self.assertEqual(ids, {pending_visit.id})

    def test_vitals_incomplete_requires_partial_vitals(self):
        incomplete = self._visit("incomplete")
        VitalReading.objects.create(
            visit=incomplete,
            patient=self.patient,
            temperature=36.5,
            heart_rate=None,
        )
        pending = self._visit("no-vitals")

        ids = set(
            apply_nursing_status_filter(
                self._base_qs(), "vitals_incomplete", _mock_request()
            ).values_list("id", flat=True)
        )
        self.assertEqual(ids, {incomplete.id})
        self.assertNotIn(pending.id, ids)

    def test_ready_requires_temp_and_heart_rate(self):
        ready = self._visit("ready")
        VitalReading.objects.create(
            visit=ready,
            patient=self.patient,
            temperature=36.8,
            heart_rate=70,
        )
        incomplete = self._visit("partial")
        VitalReading.objects.create(
            visit=incomplete,
            patient=self.patient,
            temperature=36.8,
            heart_rate=None,
        )

        ids = set(
            apply_nursing_status_filter(self._base_qs(), "ready", _mock_request()).values_list(
                "id", flat=True
            )
        )
        self.assertEqual(ids, {ready.id})

    def test_sent_to_room_includes_active_queue_rows(self):
        visit = self._visit("queued")
        ConsultationQueue.objects.create(
            room=self.room,
            patient=self.patient,
            visit=visit,
            is_active=True,
        )
        not_queued = self._visit("waiting")

        ids = set(
            apply_nursing_status_filter(
                self._base_qs(),
                "sent_to_room",
                _mock_request(date=date.today().isoformat()),
            ).values_list("id", flat=True)
        )
        self.assertEqual(ids, {visit.id})
        self.assertNotIn(not_queued.id, ids)

    def test_completed_includes_visit_status_or_completed_session(self):
        completed_visit = self._visit("done", status="completed")
        session_visit = self._visit("session-done")
        ConsultationSession.objects.create(
            room=self.room,
            patient=self.patient,
            visit=session_visit,
            status="completed",
            ended_at=timezone.now(),
        )
        in_progress = self._visit("active")

        # Completed bucket is not limited to in_progress visits.
        base = Visit.objects.filter(patient=self.patient)
        ids = set(
            apply_nursing_status_filter(base, "completed", _mock_request()).values_list(
                "id", flat=True
            )
        )
        self.assertIn(completed_visit.id, ids)
        self.assertIn(session_visit.id, ids)
        self.assertNotIn(in_progress.id, ids)

    def test_stages_are_mutually_exclusive_for_standard_pool(self):
        """Pending/ready visits must not appear in sent_to_room; queued visit not in pending."""
        pending = self._visit("p1")
        ready = self._visit("r1")
        VitalReading.objects.create(
            visit=ready,
            patient=self.patient,
            temperature=37.0,
            heart_rate=68,
        )
        queued = self._visit("q1")
        ConsultationQueue.objects.create(
            room=self.room,
            patient=self.patient,
            visit=queued,
            is_active=True,
        )

        base = self._base_qs()
        req = _mock_request(date=date.today().isoformat())
        pending_ids = set(
            apply_nursing_status_filter(base, "pending", req).values_list("id", flat=True)
        )
        ready_ids = set(
            apply_nursing_status_filter(base, "ready", req).values_list("id", flat=True)
        )
        queued_ids = set(
            apply_nursing_status_filter(base, "sent_to_room", req).values_list("id", flat=True)
        )

        self.assertEqual(pending_ids, {pending.id})
        self.assertEqual(ready_ids, {ready.id})
        self.assertEqual(queued_ids, {queued.id})
        self.assertTrue(
            pending_ids.isdisjoint(ready_ids)
            and pending_ids.isdisjoint(queued_ids)
            and ready_ids.isdisjoint(queued_ids)
        )

    def test_in_consultation_includes_queue_or_active_session(self):
        queued = self._visit("ic-q")
        ConsultationQueue.objects.create(
            room=self.room,
            patient=self.patient,
            visit=queued,
            is_active=True,
        )
        in_session = self._visit("ic-s")
        ConsultationSession.objects.create(
            room=self.room,
            patient=self.patient,
            visit=in_session,
            status="in_progress",
        )
        waiting = self._visit("ic-wait")

        ids = set(
            apply_nursing_status_filter(
                self._base_qs(), "in_consultation", _mock_request()
            ).values_list("id", flat=True)
        )
        self.assertEqual(ids, {queued.id, in_session.id})
        self.assertNotIn(waiting.id, ids)
