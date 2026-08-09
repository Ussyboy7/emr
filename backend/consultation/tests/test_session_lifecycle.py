"""API tests for consultation session start and resume behavior."""
from datetime import date, time

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from consultation.models import ConsultationRoom, ConsultationSession
from patients.models import Patient, Visit

User = get_user_model()


class ConsultationSessionLifecycleTests(APITestCase):
    def setUp(self):
        self.doctor = User.objects.create_superuser(
            username="consult_dr",
            password="testpass123",
            email="consult_dr@test.local",
            first_name="Consult",
            last_name="Doctor",
        )
        self.client.force_authenticate(user=self.doctor)

        self.patient = Patient.objects.create(
            patient_id="CS-PT-001",
            surname="Session",
            first_name="Patient",
            gender="male",
            date_of_birth=date(1992, 1, 1),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(9, 30),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )
        self.room = ConsultationRoom.objects.create(
            name="Consult Room 1",
            room_number="CS-R1",
        )
        self.client.post(f"/api/v1/consultation/rooms/{self.room.pk}/check-in/")

    def _session_payload(self):
        return {
            "room": self.room.pk,
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "doctor": self.doctor.pk,
        }

    def test_start_session_returns_201(self):
        res = self.client.post(
            "/api/v1/consultation/sessions/",
            self._session_payload(),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data.get("session_id"))
        self.assertEqual(res.data["status"], "active")
        self.assertTrue(
            ConsultationSession.objects.filter(visit=self.visit, status="active").exists()
        )

    def test_duplicate_start_resumes_existing_active_session(self):
        first = self.client.post(
            "/api/v1/consultation/sessions/",
            self._session_payload(),
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        session_id = first.data["id"]

        second = self.client.post(
            "/api/v1/consultation/sessions/",
            self._session_payload(),
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data.get("resumed"))
        self.assertEqual(second.data["id"], session_id)
        self.assertEqual(
            ConsultationSession.objects.filter(visit=self.visit, status="active").count(),
            1,
        )

    def test_complete_session_via_patch(self):
        start = self.client.post(
            "/api/v1/consultation/sessions/",
            self._session_payload(),
            format="json",
        )
        session_pk = start.data["id"]

        res = self.client.patch(
            f"/api/v1/consultation/sessions/{session_pk}/",
            {"status": "completed"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        session = ConsultationSession.objects.get(pk=session_pk)
        self.assertEqual(session.status, "completed")
