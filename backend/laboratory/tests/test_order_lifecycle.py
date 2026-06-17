"""Lab order lifecycle tests — create order with tests, list, filter."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user, create_test_patient_visit


class LabOrderCreateTest(APITestCase):
    """POST /api/v1/laboratory/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.doctor = create_test_user("lab_dr", pages=["/consultation", "/laboratory"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="LAB-ORD-01")

    def setUp(self):
        self.client.force_authenticate(user=self.doctor)

    def test_create_order_with_tests(self):
        resp = self.client.post("/api/v1/laboratory/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "priority": "routine",
            "clinical_notes": "Routine labs",
            "tests_data": [
                {"name": "Full Blood Count", "code": "FBC", "sample_type": "blood", "status": "pending"},
                {"name": "Urinalysis", "code": "UA", "sample_type": "urine", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_create_order_requires_patient(self):
        resp = self.client.post("/api/v1/laboratory/orders/", {
            "priority": "routine",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class LabOrderListTest(APITestCase):
    """GET /api/v1/laboratory/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("lab_list", pages=["/laboratory"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="LAB-LIST-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_list_returns_200(self):
        resp = self.client.get("/api/v1/laboratory/orders/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_filter_by_patient(self):
        self.client.post("/api/v1/laboratory/orders/", {
            "patient": self.patient.pk,
            "priority": "urgent",
            "tests_data": [{"name": "RBS", "code": "RBS", "sample_type": "blood", "status": "pending"}],
        }, format="json")
        resp = self.client.get(f"/api/v1/laboratory/orders/?patient={self.patient.pk}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)

    def test_stats_endpoint(self):
        resp = self.client.get("/api/v1/laboratory/orders/stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class LabOrderRBACTest(APITestCase):
    """Users without /laboratory page get 403."""

    @classmethod
    def setUpTestData(cls):
        cls.no_lab = create_test_user("no_lab", pages=["/nursing"])

    def test_no_lab_page_returns_403(self):
        self.client.force_authenticate(user=self.no_lab)
        resp = self.client.get("/api/v1/laboratory/orders/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
