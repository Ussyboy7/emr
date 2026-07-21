"""Tests for canonical principal patient_id normalization."""
from datetime import date

from django.core.management import call_command
from django.test import TestCase
from io import StringIO

from patients.models import Patient
from patients.principal_ids import (
    canonical_personal_number,
    normalize_principal_patient,
    principal_normalization_plan,
)


class NormalizePrincipalPatientIdsTests(TestCase):
    def test_plan_detects_rr_retiree(self):
        retiree = Patient.objects.create(
            patient_id="R-R-88297",
            category="retiree",
            surname="IBRAHIM",
            first_name="MUSA",
            gender="male",
            date_of_birth=date(1950, 1, 1),
            personal_number="R-88297",
        )
        self.assertEqual(
            principal_normalization_plan(retiree),
            ("88297", "R-88297"),
        )

    def test_normalize_rr_retiree_and_dependent(self):
        retiree = Patient.objects.create(
            patient_id="R-R-88297",
            category="retiree",
            surname="IBRAHIM",
            first_name="MUSA",
            gender="male",
            date_of_birth=date(1950, 1, 1),
            personal_number="R-88297",
        )
        dependent = Patient.objects.create(
            patient_id="RD-88297-1",
            category="dependent",
            dependent_type="spouse",
            surname="IBRAHIM",
            first_name="COMFORT",
            gender="female",
            date_of_birth=date(1955, 1, 1),
            principal_staff=retiree,
        )

        self.assertTrue(normalize_principal_patient(retiree))

        retiree.refresh_from_db()
        dependent.refresh_from_db()
        self.assertEqual(retiree.patient_id, "R-88297")
        self.assertEqual(retiree.personal_number, "88297")
        self.assertEqual(canonical_personal_number(retiree), "88297")
        self.assertEqual(dependent.patient_id, "RD-88297-1")

    def test_management_command_dry_run(self):
        Patient.objects.create(
            patient_id="R-R-8944",
            category="retiree",
            surname="OREKHA",
            first_name="ISHOLA",
            gender="male",
            date_of_birth=date(1950, 1, 1),
            personal_number="R-8944",
        )
        out = StringIO()
        call_command("normalize_principal_patient_ids", "--dry-run", stdout=out)
        self.assertIn("R-8944", out.getvalue())

    def test_normalize_personal_number_patient_id_mismatch(self):
        """Production case: PN updated but principal patient_id left stale."""
        employee = Patient.objects.create(
            patient_id="E-OLDPN",
            category="employee",
            employee_type="Officer",
            surname="Mismatch",
            first_name="Principal",
            gender="male",
            date_of_birth=date(1970, 6, 1),
            personal_number="NEWPN",
        )
        dependent = Patient.objects.create(
            patient_id="ED-OLDPN-1",
            category="dependent",
            dependent_type="Employee Dependent",
            surname="Mismatch",
            first_name="Child",
            gender="female",
            date_of_birth=date(2000, 1, 1),
            principal_staff=employee,
        )

        self.assertEqual(
            principal_normalization_plan(employee),
            ("NEWPN", "E-NEWPN"),
        )
        self.assertTrue(normalize_principal_patient(employee))

        employee.refresh_from_db()
        dependent.refresh_from_db()
        self.assertEqual(employee.patient_id, "E-NEWPN")
        self.assertEqual(employee.personal_number, "NEWPN")
        self.assertEqual(dependent.patient_id, "ED-NEWPN-1")
