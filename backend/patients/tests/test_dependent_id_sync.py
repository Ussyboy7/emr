"""Tests for dependent patient_id sync on promote and normalization."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from organization.models import Clinic, Department
from patients.dependent_ids import sync_dependent_patient_ids
from patients.models import Patient
from permissions.models import Role, UserRole

User = get_user_model()


def _head_user(username: str, dept) -> User:
    user = User.objects.create_user(
        username=username,
        password="testpass123",
        first_name="Head",
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


class DependentIdSyncTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name="Sync Clinic", code="SYNC")
        cls.dept = Department.objects.create(
            clinic=cls.clinic, name="Medical Records", code="MR"
        )
        cls.head = _head_user("sync-head", cls.dept)
        cls.dept.head = cls.head
        cls.dept.save(update_fields=["head"])

        cls.staff = Patient.objects.create(
            patient_id="E-STAFF-SYNC",
            category="employee",
            employee_type="Staff",
            surname="Staff",
            first_name="Parent",
            gender="male",
            date_of_birth=date(1985, 3, 3),
            personal_number="OLDPN",
        )
        cls.dep_one = Patient.objects.create(
            patient_id="ED-OLDPN-1",
            category="dependent",
            dependent_type="spouse",
            surname="Dep",
            first_name="One",
            gender="female",
            date_of_birth=date(1990, 1, 1),
            principal_staff=cls.staff,
        )
        cls.dep_two = Patient.objects.create(
            patient_id="ED-OLDPN-2",
            category="dependent",
            dependent_type="child",
            surname="Dep",
            first_name="Two",
            gender="male",
            date_of_birth=date(2015, 6, 1),
            principal_staff=cls.staff,
        )

    def setUp(self):
        self.client = APIClient()

    def test_sync_handles_id_collision_with_two_phase_rename(self):
        # Simulate a half-updated promotion: second dependent already holds the
        # target ID for sequence 1 under the new personal number.
        self.staff.personal_number = "NEWPn"
        self.staff.save(update_fields=["personal_number"])
        self.dep_two.patient_id = "ED-NEWPN-1"
        self.dep_two.save(update_fields=["patient_id"])

        updated = sync_dependent_patient_ids(self.staff)
        self.assertEqual(updated, 2)

        self.dep_one.refresh_from_db()
        self.dep_two.refresh_from_db()
        self.assertEqual(self.dep_one.patient_id, "ED-NEWPN-1")
        self.assertEqual(self.dep_two.patient_id, "ED-NEWPN-2")

    def test_promote_updates_dependent_ids(self):
        self.client.force_authenticate(user=self.head)
        res = self.client.patch(
            f"/api/v1/patients/{self.staff.pk}/promote/",
            {"new_personal_number": "OFF-123"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["dependents_updated"], 2)

        self.staff.refresh_from_db()
        self.dep_one.refresh_from_db()
        self.dep_two.refresh_from_db()
        self.assertEqual(self.staff.employee_type, "Officer")
        self.assertEqual(self.staff.personal_number, "OFF-123")
        self.assertEqual(self.staff.patient_id, "E-OFF-123")
        self.assertEqual(self.dep_one.patient_id, "ED-OFF-123-1")
        self.assertEqual(self.dep_two.patient_id, "ED-OFF-123-2")

    def test_cannot_promote_staff_to_officer_via_patch(self):
        self.client.force_authenticate(user=self.head)
        res = self.client.patch(
            f"/api/v1/patients/{self.staff.pk}/",
            {"employee_type": "Officer"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("employee_type", res.data)
