"""Patient demographics report category ordering safeguards."""
from datetime import date

from django.test import TestCase

from patients.models import Patient
from reports.patient_demographics_report import build_patient_demographics_report


class PatientDemographicsCategoryOrderTest(TestCase):
    def test_json_uses_canonical_category_order(self):
        categories = [
            {"category": "employee", "employee_type": "Officer"},
            {"category": "employee", "employee_type": "Staff"},
            {"category": "dependent", "dependent_type": "Employee Dependent"},
            {"category": "retiree"},
            {"category": "dependent", "dependent_type": "Retiree Dependent"},
            {"category": "nonnpa"},
        ]

        for index, fields in enumerate(categories, start=1):
            Patient.objects.create(
                patient_id=f"DEM-{index}",
                surname="Test",
                first_name=f"Patient {index}",
                gender="male",
                date_of_birth=date(1990, 1, 1),
                **fields,
            )

        report = build_patient_demographics_report(
            date(2026, 1, 1), date(2026, 1, 31), all_time=True
        )

        rows = report["category_breakdown"]
        self.assertEqual(
            [(row["sn"], row["category"]) for row in rows],
            [
                (1, "Officers"),
                (2, "Staff"),
                (3, "Employee Dependents"),
                (4, "Retirees"),
                (5, "Retiree Dependents"),
                (6, "Non-NPA"),
            ],
        )
