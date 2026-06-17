"""Eye care order API tests — create, list, complete, RBAC."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user, create_test_patient_visit


class EyeOrderCreateTest(APITestCase):
    """POST /api/v1/eyecare/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("eye_dr", pages=["/eyecare", "/consultation"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="EYE-PT-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_create_order_minimal(self):
        resp = self.client.post("/api/v1/eyecare/orders/", {
            "patient": self.patient.pk,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("patient", resp.data)

    def test_create_order_full_fields(self):
        resp = self.client.post("/api/v1/eyecare/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "chief_complaint": "Blurred vision",
            "diagnosis": "Myopia",
            "treatment_plan": "Corrective lenses",
            "visual_acuity_od": "6/9",
            "visual_acuity_os": "6/12",
            "visual_acuity_ou": "6/9",
            "priority": "urgent",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["priority"], "urgent")

    def test_create_order_requires_patient(self):
        resp = self.client.post("/api/v1/eyecare/orders/", {
            "diagnosis": "No patient",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class EyeOrderListTest(APITestCase):
    """GET /api/v1/eyecare/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("eye_list", pages=["/eyecare"], system_role="Medical Doctor")
        cls.patient, _ = create_test_patient_visit(patient_id="EYE-LIST-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_list_returns_200(self):
        resp = self.client.get("/api/v1/eyecare/orders/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_list_filter_by_patient(self):
        self.client.post("/api/v1/eyecare/orders/", {"patient": self.patient.pk}, format="json")
        resp = self.client.get(f"/api/v1/eyecare/orders/?patient={self.patient.pk}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)


class EyeOrderCompleteTest(APITestCase):
    """POST /api/v1/eyecare/orders/{id}/complete/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("eye_complete", pages=["/eyecare"], system_role="Medical Doctor")
        cls.patient, _ = create_test_patient_visit(patient_id="EYE-COMPL-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_complete_pending_order(self):
        from eyecare.models import EyeOrder
        order = EyeOrder.objects.create(patient=self.patient, ordered_by=self.user)
        resp = self.client.post(f"/api/v1/eyecare/orders/{order.pk}/complete/")
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT])


class EyeOrderRBACTest(APITestCase):
    """Users without /eyecare page get 403."""

    @classmethod
    def setUpTestData(cls):
        cls.no_page_user = create_test_user("no_eye", pages=["/nursing"])

    def test_no_eyecare_page_returns_403(self):
        self.client.force_authenticate(user=self.no_page_user)
        resp = self.client.get("/api/v1/eyecare/orders/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
