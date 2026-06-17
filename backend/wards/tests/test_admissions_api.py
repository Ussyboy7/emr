"""API tests for ward admissions list and filtering."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from common.tests.support import grant_pages
from patients.models import Patient, Visit
from wards.models import PatientAdmission, Ward

User = get_user_model()


class WardAdmissionApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ward_api_user",
            password="testpass123",
        )
        grant_pages(self.user, ["/nursing/wards"])

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

    def test_list_admissions_filtered_by_status(self):
        res = self.client.get("/api/v1/admissions/?status=admitted")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.data.get("results", res.data)
        self.assertTrue(all(row["status"] == "admitted" for row in rows))
        self.assertIn(self.admission_a.id, [row["id"] for row in rows])
