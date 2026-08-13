"""Regression tests for patient clinical-overview aggregation."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase

from patients.clinical_overview import build_patient_clinical_overview, build_visit_clinical_summary
from patients.models import Patient, Visit

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

    def test_visit_summary_is_scoped_to_one_multi_clinic_visit(self):
        patient = Patient.objects.create(
            patient_id="E-VISIT-SUMMARY-1",
            category="employee",
            surname="Summary",
            first_name="Visit",
            gender="female",
            date_of_birth=date(1990, 1, 1),
        )
        visit = Visit.objects.create(
            patient=patient,
            date=date.today(),
            time=time(9, 0),
            visit_type="consultation",
            clinic="GOPD",
            clinics=["GOPD", "Physiotherapy"],
            status="in_progress",
        )

        data = build_visit_clinical_summary(visit)

        self.assertEqual(data["visit"]["id"], visit.id)
        self.assertEqual(data["visit"]["clinics"], ["GOPD", "Physiotherapy"])
        self.assertEqual(data["consultations"]["results"], [])
        self.assertEqual(data["physio_orders"]["results"], [])
