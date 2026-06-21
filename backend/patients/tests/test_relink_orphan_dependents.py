"""Tests for orphan dependent re-link and patient-id parsing."""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from io import StringIO

from patients.dependent_patient_id import (
    find_principal_by_personal_number,
    find_principal_for_dependent_id,
    normalize_dependent_patient_id_format,
    parse_dependent_patient_id,
)
from patients.models import Patient

User = get_user_model()


class PrincipalLookupTests(TestCase):
    def test_find_principal_by_patient_id_when_personal_number_differs(self):
        retiree = Patient.objects.create(
            patient_id="R-88297",
            category="retiree",
            surname="IBRAHIM",
            first_name="SPOUSE",
            gender="male",
            date_of_birth=date(1950, 1, 1),
            personal_number="LEGACY-PN",
        )
        found = find_principal_by_personal_number("88297", "retiree")
        self.assertEqual(found.id, retiree.id)

    def test_find_principal_by_patient_id_when_inactive(self):
        retiree = Patient.objects.create(
            patient_id="R-8944",
            category="retiree",
            surname="OREKHA",
            first_name="SPOUSE",
            gender="male",
            date_of_birth=date(1950, 1, 1),
            personal_number="8944",
            is_active=False,
        )
        found = find_principal_by_personal_number("8944", "retiree")
        self.assertEqual(found.id, retiree.id)


class DependentPatientIdParsingTests(TestCase):
    def test_parse_dependent_patient_id(self):
        self.assertEqual(
            parse_dependent_patient_id("ED-A2331-2"),
            ("ED", "A2331", 2, "employee"),
        )
        self.assertEqual(
            parse_dependent_patient_id("rd-9697-1"),
            ("RD", "9697", 1, "retiree"),
        )
        self.assertEqual(
            parse_dependent_patient_id("RD-R-88297-1"),
            ("RD", "88297", 1, "retiree"),
        )
        self.assertEqual(
            normalize_dependent_patient_id_format("RD-R-8944-1"),
            "RD-8944-1",
        )
        self.assertIsNone(parse_dependent_patient_id("E-A2331"))


class NormalizeByPatientIdTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.retiree = Patient.objects.create(
            patient_id="R-1001",
            category="retiree",
            surname="TEST",
            first_name="RETIREE",
            gender="male",
            date_of_birth=date(1950, 1, 1),
            personal_number="1001",
        )
        cls.linked = Patient.objects.create(
            patient_id="RD-1001-2",
            category="dependent",
            dependent_type="spouse",
            surname="TEST",
            first_name="SPOUSE",
            gender="female",
            date_of_birth=date(1955, 2, 2),
            principal_staff=cls.retiree,
        )

    def test_normalize_by_patient_id(self):
        out = StringIO()
        call_command(
            "normalize_patient_ids",
            "--patient-id",
            "R-1001",
            stdout=out,
        )
        self.linked.refresh_from_db()
        self.assertEqual(self.linked.patient_id, "RD-1001-1")


class RelinkOrphanDependentsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User.objects.create_superuser(username="cleanup-admin", password="pass1234")
        cls.retiree = Patient.objects.create(
            patient_id="R-9697",
            category="retiree",
            surname="KASSIM",
            first_name="OLATUNJI",
            gender="male",
            date_of_birth=date(1950, 1, 1),
            personal_number="9697",
        )
        cls.linked = Patient.objects.create(
            patient_id="RD-9697-2",
            category="dependent",
            dependent_type="spouse",
            surname="KASSIM",
            first_name="TAIWO",
            gender="female",
            date_of_birth=date(1955, 2, 2),
            principal_staff=cls.retiree,
        )
        cls.orphan = Patient.objects.create(
            patient_id="RD-9697-1",
            category="dependent",
            dependent_type="spouse",
            surname="KASSIM",
            first_name="TAIWO",
            gender="female",
            date_of_birth=date(1955, 2, 2),
            principal_staff=None,
        )

    def test_find_principal_for_dependent_id(self):
        principal = find_principal_for_dependent_id("RD-9697-1")
        self.assertEqual(principal.id, self.retiree.id)

    def test_relink_merges_orphan_duplicate_and_syncs_ids(self):
        out = StringIO()
        call_command("relink_orphan_dependents", orphan_id=self.orphan.id, stdout=out)
        self.linked.refresh_from_db()
        self.orphan.refresh_from_db()
        self.assertEqual(self.linked.patient_id, "RD-9697-1")
        self.assertFalse(self.orphan.is_active)
        self.assertIsNotNone(self.orphan.merged_into_id)
