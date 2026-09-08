"""Pharmacy prescription create + list tests."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user, create_test_patient_visit
from pharmacy.models import GenericMedication


class PrescriptionCreateTest(APITestCase):
    """POST /api/v1/pharmacy/prescriptions/"""

    @classmethod
    def setUpTestData(cls):
        cls.doctor = create_test_user("rx_dr", pages=["/consultation", "/pharmacy"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="RX-PT-01")
        cls.generic = GenericMedication.objects.create(
            name="Paracetamol", active_ingredient="paracetamol", category="analgesic",
        )

    def setUp(self):
        self.client.force_authenticate(user=self.doctor)

    def test_create_prescription_with_items(self):
        resp = self.client.post("/api/v1/pharmacy/prescriptions/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "items": [
                {
                    "generic": self.generic.pk,
                    "quantity": 10,
                    "unit": "tablet",
                    "dose": "1g",
                    "frequency": "TDS",
                    "duration": "3 days",
                    "route": "Oral",
                },
            ],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "pending")

    def test_create_prescription_requires_items(self):
        resp = self.client.post("/api/v1/pharmacy/prescriptions/", {
            "patient": self.patient.pk,
            "items": [],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_prescription_requires_patient(self):
        resp = self.client.post("/api/v1/pharmacy/prescriptions/", {
            "items": [{"generic": self.generic.pk, "quantity": 5}],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class PrescriptionListTest(APITestCase):
    """GET /api/v1/pharmacy/prescriptions/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("rx_list", pages=["/pharmacy"], system_role="Medical Doctor")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_list_returns_200(self):
        resp = self.client.get("/api/v1/pharmacy/prescriptions/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_queue_stats(self):
        resp = self.client.get("/api/v1/pharmacy/prescriptions/queue-stats/")
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND])

    def test_list_hides_cancelled_by_default(self):
        from datetime import date
        from patients.models import Patient
        from pharmacy.models import Prescription

        patient = Patient.objects.create(
            patient_id="RX-CANCEL-HIDE",
            surname="Cancel",
            first_name="Hide",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        Prescription.objects.create(
            prescription_id="RX-CANCEL-ACTIVE",
            patient=patient,
            doctor=self.user,
            created_by=self.user,
            status="pending",
        )
        Prescription.objects.create(
            prescription_id="RX-CANCEL-HIDDEN",
            patient=patient,
            doctor=self.user,
            created_by=self.user,
            status="cancelled",
        )
        resp = self.client.get("/api/v1/pharmacy/prescriptions/", {"search": "RX-CANCEL"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        ids = {r["prescription_id"] for r in results}
        self.assertIn("RX-CANCEL-ACTIVE", ids)
        self.assertNotIn("RX-CANCEL-HIDDEN", ids)

        cancelled = self.client.get(
            "/api/v1/pharmacy/prescriptions/",
            {"search": "RX-CANCEL", "status": "cancelled"},
        )
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK)
        cancelled_ids = {r["prescription_id"] for r in cancelled.data.get("results", cancelled.data)}
        self.assertIn("RX-CANCEL-HIDDEN", cancelled_ids)
