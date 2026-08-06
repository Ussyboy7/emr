"""Organization API tests — clinic CRUD, department CRUD, RBAC."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user


class ClinicCRUDTest(APITestCase):
    """CRUD /api/v1/organization/clinics/"""

    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("org_admin", pages=["/admin/clinics", "/admin"])

    def setUp(self):
        self.client.force_authenticate(user=self.admin)

    def test_create_clinic(self):
        resp = self.client.post("/api/v1/organization/clinics/", {
            "name": "Eye Clinic",
            "code": "EC01",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["code"], "EC01")

    def test_list_clinics(self):
        self.client.post("/api/v1/organization/clinics/", {"name": "C1", "code": "C1"}, format="json")
        resp = self.client.get("/api/v1/organization/clinics/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_duplicate_code_rejected(self):
        self.client.post("/api/v1/organization/clinics/", {"name": "A", "code": "DUP1"}, format="json")
        resp = self.client.post("/api/v1/organization/clinics/", {"name": "B", "code": "DUP1"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class DepartmentCRUDTest(APITestCase):
    """CRUD /api/v1/organization/departments/"""

    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("dept_admin", pages=["/admin/clinics", "/admin"])

    def setUp(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/v1/organization/clinics/", {"name": "Main", "code": "MAIN"}, format="json")
        self.clinic_id = resp.data["id"]

    def test_create_department(self):
        resp = self.client.post("/api/v1/organization/departments/", {
            "location_clinic": self.clinic_id,
            "name": "Cardiology",
            "code": "CARD",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_list_departments(self):
        resp = self.client.get("/api/v1/organization/departments/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class OrganizationRBACTest(APITestCase):
    """Non-admin users cannot create clinics."""

    @classmethod
    def setUpTestData(cls):
        cls.nurse = create_test_user("org_nurse", pages=["/nursing"])

    def test_nurse_cannot_create_clinic(self):
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post("/api/v1/organization/clinics/", {"name": "X", "code": "X"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_nurse_can_read_clinics(self):
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.get("/api/v1/organization/clinics/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
