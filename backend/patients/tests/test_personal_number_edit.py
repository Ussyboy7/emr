"""Personal number correction: admin-only, principal + dependent ID sync."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from organization.models import Clinic, Department
from patients.models import Patient
from permissions.models import Role, UserRole

User = get_user_model()


def _mro_user(username: str, dept) -> User:
    user = User.objects.create_user(
        username=username,
        password="testpass123",
        first_name="MRO",
        last_name="User",
        department=dept,
        system_role="Medical Records Officer",
    )
    role = Role.objects.create(
        name=f"role-{username}",
        type="custom",
        permissions=["/medical-records/patients"],
    )
    UserRole.objects.create(user=user, role=role)
    return user


def _admin_user(username: str) -> User:
    return User.objects.create_superuser(
        username=username,
        password="testpass123",
        email=f"{username}@test.local",
    )


class PersonalNumberEditTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name="PN Clinic", code="PNC")
        cls.dept = Department.objects.create(
            location_clinic=cls.clinic, name="Medical Records", code="MR"
        )
        cls.mro = _mro_user("pn-mro", cls.dept)
        cls.admin = _admin_user("pn-admin")

        cls.employee = Patient.objects.create(
            patient_id="E-OLDPN",
            category="employee",
            employee_type="Staff",
            surname="Staff",
            first_name="Parent",
            gender="male",
            date_of_birth=date(1985, 3, 3),
            personal_number="OLDPN",
        )
        cls.dep = Patient.objects.create(
            patient_id="ED-OLDPN-1",
            category="dependent",
            dependent_type="Employee Dependent",
            surname="Dep",
            first_name="One",
            gender="female",
            date_of_birth=date(1990, 1, 1),
            principal_staff=cls.employee,
        )

    def setUp(self):
        self.client = APIClient()

    def test_mro_cannot_change_personal_number(self):
        self.client.force_authenticate(user=self.mro)
        res = self.client.patch(
            f"/api/v1/patients/{self.employee.pk}/",
            {"personal_number": "NEWPN"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.personal_number, "OLDPN")
        self.assertEqual(self.employee.patient_id, "E-OLDPN")

    def test_admin_personal_number_change_syncs_principal_and_dependents(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(
            f"/api/v1/patients/{self.employee.pk}/",
            {"personal_number": "NEWPN"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.employee.refresh_from_db()
        self.dep.refresh_from_db()
        self.assertEqual(self.employee.personal_number, "NEWPN")
        self.assertEqual(self.employee.patient_id, "E-NEWPN")
        self.assertEqual(self.dep.patient_id, "ED-NEWPN-1")
