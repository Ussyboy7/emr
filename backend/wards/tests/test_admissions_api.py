"""API tests for ward admissions list and filtering."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from common.tests.support import grant_pages
from patients.models import Patient, Visit
from notifications.models import Notification
from wards.models import PatientAdmission, Ward

User = get_user_model()

# Both ward pages: nursing for the opaque page gate, consultation so create
# tests can clear perform_create's ensure_doctor_action (a nursing-only user
# can validate-ward-fail but cannot successfully create an admission).
DOCTOR_PAGES = ["/nursing/wards", "/consultation/wards"]


class WardAdmissionApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ward_api_user",
            password="testpass123",
        )
        grant_pages(self.user, DOCTOR_PAGES)

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            patient_id="WARD-PT-001",
            surname="Admit",
            first_name="Patient",
            gender="male",
            date_of_birth=date(1985, 1, 1),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(8, 0),
            status="in_progress",
        )
        self.ward_a = Ward.objects.create(
            ward_code="WARD-A",
            name="Ward Alpha",
            total_beds=10,
            occupied_beds=1,
        )
        self.ward_b = Ward.objects.create(
            ward_code="WARD-B",
            name="Ward Beta",
            total_beds=8,
            occupied_beds=0,
        )
        self.admission_a = PatientAdmission.objects.create(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward_a,
            admission_diagnosis="Observation",
            status="admitted",
        )
        PatientAdmission.objects.create(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward_b,
            admission_diagnosis="Other ward",
            status="discharged",
        )

    def test_list_admissions_filtered_by_ward(self):
        res = self.client.get(f"/api/v1/admissions/?ward={self.ward_a.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in res.data.get("results", res.data)]
        self.assertEqual(ids, [self.admission_a.id])

    def test_escalation_notifies_admitting_doctor(self):
        self.admission_a.admitting_doctor = self.user
        self.admission_a.save(update_fields=["admitting_doctor"])

        res = self.client.patch(
            f"/api/v1/admissions/{self.admission_a.id}/",
            {"current_condition": "Needs Doctor Review"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        notification = Notification.objects.get(user=self.user)
        self.assertEqual(notification.priority, "urgent")
        self.assertEqual(notification.notification_type, "alert")
        self.assertEqual(notification.object_type, "ward_admission")
        self.assertEqual(notification.object_id, str(self.admission_a.id))

    def test_list_admissions_filtered_by_status(self):
        res = self.client.get("/api/v1/admissions/?status=admitted")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.data.get("results", res.data)
        self.assertTrue(all(row["status"] == "admitted" for row in rows))
        self.assertIn(self.admission_a.id, [row["id"] for row in rows])

    def test_create_admission_rejects_full_ward(self):
        self.ward_a.total_beds = 1
        self.ward_a.occupied_beds = 1
        self.ward_a.save(update_fields=["total_beds", "occupied_beds"])

        res = self.client.post(
            "/api/v1/admissions/",
            {
                "patient": self.patient.id,
                "visit": self.visit.id,
                "ward": self.ward_a.id,
                "admission_type": "observation",
                "admission_diagnosis": "Fever",
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ward", res.data)
        self.assertIn("available", str(res.data["ward"]).lower())

    def test_create_admission_rejects_inactive_ward(self):
        self.ward_a.status = "closed"
        self.ward_a.save(update_fields=["status"])

        res = self.client.post(
            "/api/v1/admissions/",
            {
                "patient": self.patient.id,
                "visit": self.visit.id,
                "ward": self.ward_a.id,
                "admission_type": "observation",
                "admission_diagnosis": "Fever",
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ward", res.data)
        self.assertIn("active", str(res.data["ward"]).lower())

    def test_create_admission_links_consultation_session(self):
        from consultation.models import ConsultationRoom, ConsultationSession

        room = ConsultationRoom.objects.create(
            name="Room 1",
            is_active=True,
        )
        session = ConsultationSession.objects.create(
            session_id="CS-LINK-001",
            room=room,
            patient=self.patient,
            doctor=self.user,
            visit=self.visit,
            status="completed",
            started_at="2026-08-10T08:00:00Z",
        )

        res = self.client.post(
            "/api/v1/admissions/",
            {
                "patient": self.patient.id,
                "visit": self.visit.id,
                "ward": self.ward_b.id,
                "admission_type": "observation",
                "admission_diagnosis": "Fever",
                "consultation_session": session.id,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["consultation_session"], session.id)
        try:
            created = PatientAdmission.objects.get(pk=res.data["id"])
        except (KeyError, TypeError):
            created = PatientAdmission.objects.get(pk=res.data["pk"])
        self.assertEqual(created.consultation_session_id, session.id)
