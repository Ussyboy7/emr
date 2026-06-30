"""Unit tests for admission-scoped nursing order helpers."""
from datetime import date, time, timedelta

from django.test import TestCase

from nursing.admission_orders import filter_orders_for_admission
from nursing.models import NursingOrder
from patients.models import Patient, Visit
from wards.models import Ward, PatientAdmission


class FilterOrdersForAdmissionTests(TestCase):
    def setUp(self):
        self.patient = Patient.objects.create(
            patient_id="FOA-PT-1",
            surname="Filter",
            first_name="Test",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date(2026, 3, 24),
            time=time(10, 0),
            status="in_progress",
        )
        self.ward = Ward.objects.create(ward_code="FOA-W1", name="Filter Ward", total_beds=5)
        self.admission = PatientAdmission.objects.create(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward,
            admission_diagnosis="Test",
            status="admitted",
        )
        stay_at = self.admission.admission_date
        self.in_stay = NursingOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            admission=self.admission,
            order_type="dressing",
            description="In stay",
        )
        self.pre_stay = NursingOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            admission=self.admission,
            order_type="dressing",
            description="Pre stay",
        )
        NursingOrder.objects.filter(pk=self.in_stay.pk).update(ordered_at=stay_at)
        NursingOrder.objects.filter(pk=self.pre_stay.pk).update(
            ordered_at=stay_at - timedelta(hours=2),
        )
        self.in_stay.refresh_from_db()
        self.pre_stay.refresh_from_db()

    def test_excludes_pre_admission_orders(self):
        qs = filter_orders_for_admission(NursingOrder.objects.all(), self.admission.pk)
        ids = set(qs.values_list("pk", flat=True))
        self.assertIn(self.in_stay.pk, ids)
        self.assertNotIn(self.pre_stay.pk, ids)
