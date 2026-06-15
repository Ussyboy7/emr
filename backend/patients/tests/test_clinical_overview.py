"""Regression tests for patient clinical-overview aggregation."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from patients.clinical_overview import build_patient_clinical_overview
from patients.models import Patient

User = get_user_model()


class ClinicalOverviewBuildTests(TestCase):
    def test_build_overview_does_not_raise(self):
        patient = Patient.objects.create(
            patient_id="E-OVERVIEW-1",
            category="employee",
            surname="Overview",
            first_name="Test",
            gender="male",
            date_of_birth=date(1990, 1, 1),
            personal_number="OV-1",
        )
        data = build_patient_clinical_overview(patient)
        self.assertIn("consultations", data)
        self.assertIn("radiology_reports", data)
        self.assertIn("vitals", data)
        self.assertIn("medical_history", data)
