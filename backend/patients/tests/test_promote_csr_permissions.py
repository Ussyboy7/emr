"""Tests for promote / CSR permissions (department head/deputy)."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from organization.models import Clinic, Department
from patients.models import Patient
from patients.permissions import can_manage_patient_lifecycle
from permissions.models import Role, UserRole

User = get_user_model()


def _user_with_pages(username: str, pages: list[str], **kwargs) -> User:
    user = User.objects.create_user(
        username=username,
        password="testpass123",
        first_name="Test",
        last_name="User",
        **kwargs,
    )
    role = Role.objects.create(
        name=f"role-{username}",
        type="custom",
        permissions=pages,
    )
    UserRole.objects.create(user=user, role=role)
    return user


class PromoteCsrPermissionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name="MR Clinic", code="MRC")
        cls.dept = Department.objects.create(
            location_clinic=cls.clinic, name="Medical Records", code="MR"
        )
        cls.staff_patient = Patient.objects.create(
            patient_id="E-STAFF-001",
            category="employee",
            employee_type="Staff",
            surname="Staff",
            first_name="Member",
            gender="male",
            date_of_birth=date(1990, 1, 1),
            personal_number="PN-STAFF-001",
        )
        cls.retiree_patient = Patient.objects.create(
            patient_id="R-TEST-001",
            category="retiree",
            surname="Retired",
            first_name="Worker",
            gender="female",
            date_of_birth=date(1955, 6, 1),
            personal_number="PN-RET-001",
        )
        cls.mro = _user_with_pages(
            "mro-member",
            ["/medical-records/patients"],
            department=cls.dept,
            system_role="Medical Records Officer",
        )
        cls.head = _user_with_pages(
            "records-head",
            ["/medical-records/patients"],
            department=cls.dept,
            system_role="Medical Records Officer",
        )
        cls.dept.head = cls.head
        cls.dept.save(update_fields=["head"])
        cls.deputy = _user_with_pages(
            "records-deputy",
            ["/medical-records/patients"],
            department=cls.dept,
            system_role="Medical Records Officer",
        )
        cls.dept.deputy_head = cls.deputy
        cls.dept.save(update_fields=["deputy_head"])

    def setUp(self):
        self.client = APIClient()

    def test_helper_denies_plain_mro(self):
        self.assertFalse(can_manage_patient_lifecycle(self.mro))

    def test_helper_allows_head_and_deputy(self):
        self.assertTrue(can_manage_patient_lifecycle(self.head))
        self.assertTrue(can_manage_patient_lifecycle(self.deputy))

    def test_mro_cannot_promote(self):
        self.client.force_authenticate(user=self.mro)
        res = self.client.patch(
            f"/api/v1/patients/{self.staff_patient.pk}/promote/",
            {"new_personal_number": "PN-OFF-999"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_head_can_promote(self):
        self.client.force_authenticate(user=self.head)
        res = self.client.patch(
            f"/api/v1/patients/{self.staff_patient.pk}/promote/",
            {"new_personal_number": "PN-OFF-999"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("patient", res.data)
        self.staff_patient.refresh_from_db()
        self.assertEqual(self.staff_patient.employee_type, "Officer")
        self.assertEqual(self.staff_patient.personal_number, "PN-OFF-999")

    def test_deputy_can_convert_to_csr(self):
        self.client.force_authenticate(user=self.deputy)
        res = self.client.patch(
            f"/api/v1/patients/{self.retiree_patient.pk}/convert-to-csr/",
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.retiree_patient.refresh_from_db()
        self.assertEqual(self.retiree_patient.category, "nonnpa")
        self.assertEqual(self.retiree_patient.nonnpa_type, "CSR")

    def test_mro_cannot_convert_employee_to_retiree(self):
        self.client.force_authenticate(user=self.mro)
        res = self.client.patch(
            f"/api/v1/patients/{self.staff_patient.pk}/",
            {"category": "retiree"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_head_can_convert_employee_to_retiree(self):
        self.client.force_authenticate(user=self.head)
        res = self.client.patch(
            f"/api/v1/patients/{self.staff_patient.pk}/",
            {"category": "retiree"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.staff_patient.refresh_from_db()
        self.assertEqual(self.staff_patient.category, "retiree")
        self.assertTrue(self.staff_patient.patient_id.startswith("R-"))
