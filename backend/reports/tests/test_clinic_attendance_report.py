"""Clinic attendance report endpoint tests."""
from datetime import date, time

from rest_framework.test import APITestCase

from common.tests.support import create_test_user
from patients.models import Patient, Visit


class ClinicAttendanceReportTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("clinic_attendance_admin", superuser=True)
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
                patient_id=f"CLINIC-ATT-{index}",
                surname="Test",
                first_name=f"Patient {index}",
                gender="male",
                date_of_birth=date(1990, 1, 1),
                **fields,
            )
            Visit.objects.create(
                patient=patient,
                visit_id=f"CLINIC-ATT-VISIT-{index}",
                date=date.today(),
                time=time(10, 0),
                status="completed",
                clinic="GOPD",
            )

    def setUp(self):
        self.client.force_authenticate(user=self.admin)

    def test_orders_retirees_before_retiree_dependents_and_non_npa(self):
        response = self.client.get(
            "/api/v1/reports/clinic-attendance/?period=all&clinic_type=GOPD"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [(row["sn"], row["category"], row["total"]) for row in response.data["data"]],
            [
                (1, "Officers", 1),
                (2, "Staff", 1),
                (3, "Employee Dependents", 1),
                (4, "Retirees", 1),
                (5, "Retiree Dependents", 1),
                (6, "Non-NPA", 1),
            ],
        )
