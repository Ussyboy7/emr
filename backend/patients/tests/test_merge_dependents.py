"""Merge should re-parent and re-sync dependents onto the winner."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from organization.models import Clinic, Department
from patients.merge import merge_patients
from patients.models import Patient
from permissions.models import Role, UserRole

User = get_user_model()


def _admin_user(username: str) -> User:
    user = User.objects.create_superuser(
        username=username,
        password="testpass123",
        email=f"{username}@test.local",
    )
    role = Role.objects.create(
        name=f"role-{username}",
        type="custom",
        permissions={"capabilities": ["patient_merge", "patient_unmerge"]},
    )
    UserRole.objects.create(user=user, role=role)
    return user


class MergeDependentsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        Clinic.objects.create(name="Merge Clinic", code="MCL")
        cls.admin = _admin_user("merge-admin")

        cls.winner = Patient.objects.create(
            patient_id="E-WIN-001",
            category="employee",
            employee_type="Officer",
            surname="Winner",
            first_name="Principal",
            gender="male",
            date_of_birth=date(1980, 1, 1),
            personal_number="WINPN",
        )
        cls.loser = Patient.objects.create(
            patient_id="E-LOSE-001",
            category="employee",
            employee_type="Staff",
            surname="Loser",
            first_name="Duplicate",
            gender="male",
            date_of_birth=date(1980, 2, 2),
            personal_number="LOSEPN",
        )
        cls.dep_one = Patient.objects.create(
            patient_id="ED-LOSEPN-1",
            category="dependent",
            dependent_type="Employee Dependent",
            surname="Dep",
            first_name="One",
            gender="female",
            date_of_birth=date(2000, 1, 1),
            principal_staff=cls.loser,
        )

    def test_merge_reparents_and_resyncs_dependents_on_winner(self):
        result = merge_patients(
            winner_id=self.winner.pk,
            loser_id=self.loser.pk,
            user=self.admin,
            reason="[test] duplicate principal merge",
        )
        self.assertEqual(result["counters"].get("dependents_repointed"), 1)
        self.assertEqual(result["counters"].get("dependents_synced"), 1)

        self.dep_one.refresh_from_db()
        self.assertEqual(self.dep_one.principal_staff_id, self.winner.pk)
        self.assertEqual(self.dep_one.patient_id, "ED-WINPN-1")
        self.assertEqual(self.dep_one.dependent_type, "Employee Dependent")

        self.loser.refresh_from_db()
        self.assertFalse(self.loser.is_active)
        self.assertEqual(self.loser.merged_into_id, self.winner.pk)
