"""Principal patient_id must stay aligned with personal_number on save."""
from datetime import date

from django.core.exceptions import ValidationError
from django.test import TestCase

from patients.models import Patient


class PrincipalIdAlignTests(TestCase):
    def test_save_aligns_mismatched_patient_id_with_personal_number(self):
        """Reproduce prod bug: PN=A3800 but patient_id=E-93929."""
        principal = Patient.objects.create(
            patient_id="E-93929",
            category="employee",
            employee_type="Officer",
            surname="Abubakar",
            first_name="Halliru",
            gender="male",
            date_of_birth=date(1995, 1, 1),
            personal_number="A3800",
        )
        dep = Patient.objects.create(
            patient_id="ED-A3800-1",
            category="dependent",
            dependent_type="Employee Dependent",
            surname="Abubakar",
            first_name="Halimatu",
            gender="female",
            date_of_birth=date(2000, 1, 1),
            principal_staff=principal,
        )

        principal.surname = "Abubakar"
        principal.save(update_fields=["surname"])

        principal.refresh_from_db()
        self.assertEqual(principal.personal_number, "A3800")
        self.assertEqual(principal.patient_id, "E-A3800")

        dep.refresh_from_db()
        self.assertEqual(dep.patient_id, "ED-A3800-1")

    def test_save_rejects_patient_id_collision(self):
        Patient.objects.create(
            patient_id="E-TAKEN",
            category="employee",
            employee_type="Staff",
            surname="Other",
            first_name="Patient",
            gender="male",
            date_of_birth=date(1990, 1, 1),
            personal_number="TAKEN",
        )
        principal = Patient.objects.create(
            patient_id="E-OLD",
            category="employee",
            employee_type="Staff",
            surname="Staff",
            first_name="One",
            gender="male",
            date_of_birth=date(1985, 1, 1),
            personal_number="OLD",
        )

        principal.personal_number = "TAKEN"
        with self.assertRaises(ValidationError):
            principal.save()

    def test_category_change_to_retiree_aligns_patient_id_on_save(self):
        employee = Patient.objects.create(
            patient_id="E-RETIRE-ME",
            category="employee",
            employee_type="Staff",
            surname="Staff",
            first_name="Parent",
            gender="male",
            date_of_birth=date(1960, 1, 1),
            personal_number="RETIRE-ME",
        )
        employee.category = "retiree"
        employee.save()

        employee.refresh_from_db()
        self.assertEqual(employee.patient_id, "R-RETIRE-ME")
        self.assertEqual(employee.personal_number, "RETIRE-ME")
