"""Verify the admission FK on order models round-trips."""
from datetime import date, time

from django.test import TestCase

from patients.models import Patient, Visit
from pharmacy.models import Prescription
from wards.models import PatientAdmission, Ward


class OrderAdmissionFkTest(TestCase):
    def setUp(self):
        self.patient = Patient.objects.create(
            patient_id="FK-PT-001",
            surname="Round",
            first_name="Trip",
            gender="male",
            date_of_birth=date(1985, 1, 1),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(8, 0),
            status="in_progress",
        )
        self.ward = Ward.objects.create(
            ward_code="WARD-FK",
            name="Ward FK",
            total_beds=5,
            occupied_beds=0,
        )
        self.admission = PatientAdmission.objects.create(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward,
            admission_diagnosis="Ward round test",
            status="admitted",
        )

    def test_prescription_has_admission_fk(self):
        rx = Prescription.objects.create(
            patient=self.patient,
            admission=self.admission,
        )
        self.assertEqual(rx.admission_id, self.admission.pk)
        self.assertEqual(self.admission.prescriptions.count(), 1)
