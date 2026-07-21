"""Nursing pool list includes today's completed visits when date-scoped."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom, ConsultationSession

User = get_user_model()


class NursingPoolDateScopeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.nurse = create_test_user(
            "pool_date_nurse",
            pages=["/nursing/pool-queue"],
            system_role="Nurse",
        )
        cls.room = ConsultationRoom.objects.create(name="Pool Scope Room", room_number="PS-1")

    def setUp(self):
        self.client.force_authenticate(user=self.nurse)

    def test_date_scoped_pool_includes_completed_and_excludes_scheduled(self):
        today = date.today().isoformat()
        _, open_visit = create_test_patient_visit(patient_id="POOL-OPEN-01")
        open_visit.status = "in_progress"
        open_visit.date = date.today()
        open_visit.time = time(8, 0)
        open_visit.save(update_fields=["status", "date", "time"])

        _, done_visit = create_test_patient_visit(patient_id="POOL-DONE-01")
        done_visit.status = "completed"
        done_visit.date = date.today()
        done_visit.time = time(9, 0)
        done_visit.save(update_fields=["status", "date", "time"])

        _, scheduled = create_test_patient_visit(patient_id="POOL-SCHED-01")
        scheduled.status = "scheduled"
        scheduled.date = date.today()
        scheduled.time = time(10, 0)
        scheduled.save(update_fields=["status", "date", "time"])

        res = self.client.get(f"/api/v1/visits/?date={today}&nursing_pool=1")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data["results"]}
        self.assertIn(open_visit.id, ids)
        self.assertIn(done_visit.id, ids)
        self.assertNotIn(scheduled.id, ids)

    def test_date_scoped_pool_includes_visit_with_completed_session(self):
        today = date.today().isoformat()
        patient, visit = create_test_patient_visit(patient_id="POOL-SESSION-01")
        visit.status = "in_progress"
        visit.date = date.today()
        visit.time = time(11, 0)
        visit.save(update_fields=["status", "date", "time"])

        ConsultationSession.objects.create(
            room=self.room,
            patient=patient,
            visit=visit,
            doctor=self.nurse,
            status="completed",
            ended_at=timezone.now(),
        )

        res = self.client.get(f"/api/v1/visits/?date={today}&nursing_pool=1")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data["results"]}
        self.assertIn(visit.id, ids)

        # Explicit completed stage still finds it.
        res_completed = self.client.get(
            f"/api/v1/visits/?date={today}&nursing_pool=1&nursing_status=completed"
        )
        self.assertEqual(res_completed.status_code, status.HTTP_200_OK)
        completed_ids = {row["id"] for row in res_completed.data["results"]}
        self.assertIn(visit.id, completed_ids)

    def test_client_status_in_progress_does_not_hide_completed_in_dated_pool(self):
        today = date.today().isoformat()
        _, done_visit = create_test_patient_visit(patient_id="POOL-STATUS-01")
        done_visit.status = "completed"
        done_visit.date = date.today()
        done_visit.time = time(12, 0)
        done_visit.save(update_fields=["status", "date", "time"])

        res = self.client.get(
            f"/api/v1/visits/?date={today}&nursing_pool=1&status=in_progress"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data["results"]}
        self.assertIn(done_visit.id, ids)

    def test_undated_pool_snapshot_still_hides_completed_sessions(self):
        patient, visit = create_test_patient_visit(patient_id="POOL-SNAP-01")
        visit.status = "in_progress"
        visit.date = date.today()
        visit.save(update_fields=["status", "date"])
        ConsultationSession.objects.create(
            room=self.room,
            patient=patient,
            visit=visit,
            doctor=self.nurse,
            status="completed",
            ended_at=timezone.now(),
        )

        res = self.client.get("/api/v1/visits/?nursing_pool=1")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data["results"]}
        self.assertNotIn(visit.id, ids)
