"""HR compliance and exemption API tests."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user, create_test_patient_visit


class HRComplianceListTest(APITestCase):
    """GET /api/v1/hr/compliance/"""

    @classmethod
    def setUpTestData(cls):
        cls.hr_user = create_test_user("hr_officer", pages=["/hr", "/hr/annual-checkups"], system_role="Human Resources")
        cls.non_hr = create_test_user("non_hr", pages=["/nursing"])

    def test_hr_user_can_list(self):
        self.client.force_authenticate(user=self.hr_user)
        resp = self.client.get("/api/v1/hr/compliance/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_non_hr_user_forbidden(self):
        self.client.force_authenticate(user=self.non_hr)
        resp = self.client.get("/api/v1/hr/compliance/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_summary_endpoint(self):
        self.client.force_authenticate(user=self.hr_user)
        resp = self.client.get("/api/v1/hr/compliance/summary/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class HRExemptionTest(APITestCase):
    """CRUD /api/v1/hr/exemptions/"""

    @classmethod
    def setUpTestData(cls):
        cls.hr_user = create_test_user("hr_exempt", pages=["/hr", "/hr/annual-checkups"], system_role="Human Resources")
        cls.patient, _ = create_test_patient_visit(patient_id="HR-PT-01")

    def setUp(self):
        self.client.force_authenticate(user=self.hr_user)

    def test_create_exemption(self):
        resp = self.client.post("/api/v1/hr/exemptions/", {
            "patient": self.patient.pk,
            "programme_year": 2026,
            "reason": "medical",
            "notes": "Currently on extended leave",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_list_exemptions(self):
        resp = self.client.get("/api/v1/hr/exemptions/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
