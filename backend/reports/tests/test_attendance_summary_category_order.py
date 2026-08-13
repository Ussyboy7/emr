"""Attendance summary category ordering safeguards."""
from datetime import date, time

from django.test import TestCase

from patients.models import Patient, Visit
from reports.attendance_summary_report import build_attendance_summary_for_visits


class AttendanceSummaryCategoryOrderTest(TestCase):
    def test_json_uses_canonical_category_order_without_changing_aggregates(self):
        categories = [
            {"category": "employee", "employee_type": "Officer"},
            {"category": "employee", "employee_type": "Staff"},
            {"category": "dependent", "dependent_type": "Employee Dependent"},
            {"category": "retiree"},
            {"category": "dependent", "dependent_type": "Retiree Dependent"},
            {"category": "nonnpa"},
        ]

        for index, fields in enumerate(categories, start=1):
            patient = Patient.objects.create(
                patient_id=f"ATT-{index}",
                surname="Test",
                first_name=f"Patient {index}",
                gender="male",
                date_of_birth=date(1990, 1, 1),
                **fields,
            )
            Visit.objects.create(
                patient=patient,
                visit_id=f"ATT-VISIT-{index}",
                date=date(2026, 1, 15),
                time=time(10, 0),
            )

        report = build_attendance_summary_for_visits(Visit.objects.all())

        self.assertEqual(
            [(row["sn"], row["category"]) for row in report["data"]],
            [
                (1, "Officers"),
                (2, "Staff"),
                (3, "Employee Dependants"),
                (4, "Retirees"),
                (5, "Retiree Dependents"),
                (6, "Non NPA"),
            ],
        )
        self.assertEqual(
            report["summary"],
            {
                "total_employee": 2,
                "total_non_employee": 4,
                "total_male": 6,
                "total_female": 0,
                "grand_total": 6,
            },
        )
