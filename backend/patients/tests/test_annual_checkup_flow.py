"""Integration tests: annual check-up create → sign-off → PDFs."""

from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase

from common.tests.support import create_test_user
from permissions.models import Role, UserRole
from patients.annual_checkup_pdfs import (
    build_annual_checkup_report_pdf,
    build_hr_outcome_letter_pdf,
)
from patients.annual_checkup_services import (
    create_annual_checkup_for_visit,
    sign_off_annual_checkup,
)
from patients.models import AnnualCheckup, Patient, Visit, VitalReading

User = get_user_model()


class AnnualCheckupFlowTests(TestCase):
    def setUp(self):
        self.doctor = create_test_user(
            "dr_checkup",
            pages=["/consultation/start"],
            system_role="Medical Doctor",
        )
        role = Role.objects.create(
            name="annual-checkup-signoff",
            type="custom",
            permissions={
                "pages": ["/consultation/start"],
                "capabilities": ["annual_checkup_signoff"],
            },
        )
        UserRole.objects.create(user=self.doctor, role=role)
        self.patient = Patient.objects.create(
            patient_id="E-TEST001",
            category="employee",
            surname="Employee",
            first_name="Test",
            gender="male",
            date_of_birth=date(1990, 1, 1),
            personal_number="TEST001",
            is_active=True,
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            visit_type="annual_checkup",
            date=date.today(),
            time=time(9, 0),
            clinic="GOPD",
            status="in_progress",
        )
        VitalReading.objects.create(
            visit=self.visit,
            patient=self.patient,
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=72,
            temperature=36.5,
            respiratory_rate=16,
            oxygen_saturation=98,
            weight=70,
            height=175,
        )

    def test_create_sign_off_generates_pdfs(self):
        checkup = create_annual_checkup_for_visit(self.visit)
        self.assertEqual(checkup.status, "in_progress")
        self.assertTrue(checkup.components_required)

        signed = sign_off_annual_checkup(
            checkup,
            user=self.doctor,
            fitness_outcome="fit",
            outcome_notes="Fit for duty without restrictions.",
            override_reason="Test fixture — partial components only.",
        )
        signed.refresh_from_db()
        self.assertEqual(signed.status, "completed")
        self.assertTrue(signed.report_pdf)
        self.assertTrue(signed.outcome_letter_pdf)
        self.assertIsNotNone(signed.next_due_date)

        clinical = build_annual_checkup_report_pdf(signed)
        self.assertTrue(clinical.startswith(b"%PDF"))
        letter = build_hr_outcome_letter_pdf(signed)
        self.assertTrue(letter.startswith(b"%PDF"))

    def test_idempotent_wrapper_create(self):
        first = create_annual_checkup_for_visit(self.visit)
        second = create_annual_checkup_for_visit(self.visit)
        self.assertEqual(first.id, second.id)
