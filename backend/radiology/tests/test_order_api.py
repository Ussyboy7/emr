"""Radiology order API tests — create, list, filter, RBAC."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user, create_test_patient_visit


class RadiologyOrderCreateTest(APITestCase):
    """POST /api/v1/radiology/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("rad_dr", pages=["/radiology", "/consultation"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit()

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_create_order_minimal(self):
        resp = self.client.post("/api/v1/radiology/orders/", {
            "patient": self.patient.pk,
            "priority": "routine",
            "clinical_notes": "Persistent cough",
            "studies_data": [
                {"procedure": "Chest X-Ray", "body_part": "Chest", "modality": "X-Ray", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["patient"], self.patient.pk)
        self.assertEqual(resp.data["priority"], "routine")

    def test_create_order_with_visit(self):
        resp = self.client.post("/api/v1/radiology/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "priority": "urgent",
            "clinical_notes": "Trauma",
            "studies_data": [
                {"procedure": "Pelvis AP", "body_part": "Pelvis", "modality": "X-Ray", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["priority"], "urgent")

    def test_create_order_requires_patient(self):
        resp = self.client.post("/api/v1/radiology/orders/", {
            "priority": "routine",
            "clinical_notes": "Missing patient",
        }, format="json")
        self.assertIn(resp.status_code, [status.HTTP_400_BAD_REQUEST])


class RadiologyOrderListTest(APITestCase):
    """GET /api/v1/radiology/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("rad_list", pages=["/radiology"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="RAD-LIST-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_list_empty(self):
        resp = self.client.get("/api/v1/radiology/orders/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_list_filter_by_patient(self):
        self.client.post("/api/v1/radiology/orders/", {
            "patient": self.patient.pk,
            "priority": "routine",
            "studies_data": [{"procedure": "X", "body_part": "Y", "modality": "X-Ray", "status": "pending"}],
        }, format="json")
        resp = self.client.get(f"/api/v1/radiology/orders/?patient={self.patient.pk}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)


class RadiologyOrderRBACTest(APITestCase):
    """RBAC: users without /radiology page cannot access."""

    @classmethod
    def setUpTestData(cls):
        cls.no_page_user = create_test_user("no_rad", pages=["/nursing"])

    def test_no_radiology_page_returns_403(self):
        self.client.force_authenticate(user=self.no_page_user)
        resp = self.client.get("/api/v1/radiology/orders/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
