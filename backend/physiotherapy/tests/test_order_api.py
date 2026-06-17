"""Physiotherapy order API tests — create, list, RBAC."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user, create_test_patient_visit


class PhysioOrderCreateTest(APITestCase):
    """POST /api/v1/orders/ (physiotherapy router at root)"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("physio_su", superuser=True)
        cls.patient, cls.visit = create_test_patient_visit(patient_id="PHYSIO-PT-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_create_order_minimal(self):
        resp = self.client.post("/api/v1/orders/", {
            "patient": self.patient.pk,
            "diagnosis": "Lumbar strain",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("patient", resp.data)

    def test_create_order_full_fields(self):
        resp = self.client.post("/api/v1/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "diagnosis": "Frozen shoulder",
            "history_clinical_findings": "Restricted ROM",
            "drug_history": "Ibuprofen",
            "special_instructions": "Avoid overhead movements",
            "priority": "high",
            "referral_source": "doctor",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_create_order_requires_diagnosis(self):
        resp = self.client.post("/api/v1/orders/", {
            "patient": self.patient.pk,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class PhysioOrderListTest(APITestCase):
    """GET /api/v1/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("physio_list_su", superuser=True)
        cls.patient, _ = create_test_patient_visit(patient_id="PHYSIO-LIST-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_list_empty(self):
        resp = self.client.get("/api/v1/orders/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_list_filter_by_patient(self):
        self.client.post("/api/v1/orders/", {
            "patient": self.patient.pk,
            "diagnosis": "Test dx",
        }, format="json")
        resp = self.client.get(f"/api/v1/orders/?patient={self.patient.pk}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)

    def test_list_filter_by_priority(self):
        self.client.post("/api/v1/orders/", {
            "patient": self.patient.pk,
            "diagnosis": "Urgent dx",
            "priority": "urgent",
        }, format="json")
        resp = self.client.get("/api/v1/orders/?priority=urgent")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
