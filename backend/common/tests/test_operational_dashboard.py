"""Regression tests for the operational dashboard's facility performance card."""
from __future__ import annotations

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from common.mixins import SCOPE_ALL
from common.operational_dashboard import build_operational_dashboard
from consultation.models import ConsultationRoom, ConsultationSession
from laboratory.models import LabOrder, LabTest
from organization.models import Clinic
from patients.models import Patient, Visit
from pharmacy.models import Prescription

User = get_user_model()


class FacilityPerformanceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.fac_a = Clinic.objects.create(name="Facility A", code="A-01")
        self.fac_b = Clinic.objects.create(name="Facility B", code="B-01")
        self.room_a = ConsultationRoom.objects.create(
            name="Room A", room_number="A-ROOM-1", location_clinic=self.fac_a
        )
        self.room_b = ConsultationRoom.objects.create(
            name="Room B", room_number="B-ROOM-1", location_clinic=self.fac_b
        )
        self.pa = Patient.objects.create(
            patient_id="PERF-PT-A-01", surname="PerfA", first_name="A",
            gender="male", date_of_birth=date(1990, 1, 1),
        )
        self.pb = Patient.objects.create(
            patient_id="PERF-PT-B-01", surname="PerfB", first_name="B",
            gender="female", date_of_birth=date(1991, 2, 2),
        )
        self.today = timezone.localdate()

    def _visit(self, patient, clinic, status="completed"):
        return Visit.objects.create(
            patient=patient,
            visit_type="consultation",
            status=status,
            date=self.today,
            time="10:00",
            clinic="GOPD",
            location_clinic=clinic,
        )

    def _completed_session(self, patient, room, clinic, minutes=15):
        # started_at is auto_now_add, so it must be set via update() after create.
        started = timezone.now() - timedelta(minutes=minutes)
        session = ConsultationSession.objects.create(
            session_id=f"SESS-{patient.patient_id}-{room.room_number}",
            room=room,
            patient=patient,
            location_clinic=clinic,
            status="completed",
            ended_at=timezone.now(),
        )
        ConsultationSession.objects.filter(pk=session.pk).update(started_at=started)
        return session

    def _lab_order(self, patient, clinic):
        return LabOrder.objects.create(
            order_id=f"LAB-PERF-{patient.patient_id}",
            patient=patient,
            location_clinic=clinic,
        )

    def _lab_test(self, order, name):
        return LabTest.objects.create(
            order=order,
            name=name,
            code=name.upper()[:20],
            sample_type="Blood",
            status="verified",
            processed_at=timezone.now(),
        )

    def _rx(self, patient, clinic):
        return Prescription.objects.create(
            prescription_id=f"RX-PERF-{patient.patient_id}",
            patient=patient,
            location_clinic=clinic,
            status="dispensed",
            dispensed_at=timezone.now(),
        )

    def test_facility_performance_aggregates_per_facility(self):
        self._visit(self.pa, self.fac_a, status="completed")
        self._visit(self.pa, self.fac_a, status="in_progress")
        self._visit(self.pb, self.fac_b, status="completed")
        self._completed_session(self.pa, self.room_a, self.fac_a, minutes=30)
        self._lab_test(self._lab_order(self.pa, self.fac_a), "Glucose")
        self._rx(self.pa, self.fac_a)
        self._rx(self.pb, self.fac_b)

        data = build_operational_dashboard(self.today, clinic_scope=SCOPE_ALL)
        rows = {r["name"]: r for r in data["facilityPerformance"]}

        self.assertNotIn("clinicPerformance", data)

        a = rows["Facility A"]
        self.assertEqual(a["visits"], 2)
        self.assertEqual(a["completionRate"], 50.0)
        self.assertEqual(a["avgConsultationTime"], 30.0)
        self.assertEqual(a["labTestsProcessed"], 1)
        self.assertEqual(a["prescriptionsDispensed"], 1)

        b = rows["Facility B"]
        self.assertEqual(b["visits"], 1)
        self.assertEqual(b["completionRate"], 100.0)
        self.assertEqual(b["avgConsultationTime"], None)
        self.assertEqual(b["labTestsProcessed"], 0)
        self.assertEqual(b["prescriptionsDispensed"], 1)

    def test_no_fake_target_or_avg_wait_keys(self):
        self._visit(self.pa, self.fac_a)
        data = build_operational_dashboard(self.today, clinic_scope=SCOPE_ALL)
        row = data["facilityPerformance"][0]
        self.assertNotIn("target", row)
        self.assertNotIn("avgWait", row)
        self.assertNotIn("patients", row)

    def test_scoped_user_sees_only_their_facility(self):
        self._visit(self.pa, self.fac_a)
        self._visit(self.pb, self.fac_b)

        data = build_operational_dashboard(self.today, clinic_scope=self.fac_a)
        names = [r["name"] for r in data["facilityPerformance"]]
        self.assertEqual(names, ["Facility A"])

    def test_avg_consultation_time_null_without_completed_sessions(self):
        self._visit(self.pa, self.fac_a)
        data = build_operational_dashboard(self.today, clinic_scope=self.fac_a)
        self.assertIsNone(data["facilityPerformance"][0]["avgConsultationTime"])

    def test_lab_processed_counts_event_not_current_status(self):
        # Test processed today but verified (status moved on) still counts once.
        order = self._lab_order(self.pa, self.fac_a)
        self._lab_test(order, "Glucose")
        data = build_operational_dashboard(self.today, clinic_scope=self.fac_a)
        self.assertEqual(data["facilityPerformance"][0]["labTestsProcessed"], 1)

    def test_completion_rate_denominator_is_visits(self):
        # Two visits, one completed -> 50%, even though there is a completed session.
        self._visit(self.pa, self.fac_a, status="completed")
        self._visit(self.pa, self.fac_a, status="in_progress")
        self._completed_session(self.pa, self.room_a, self.fac_a)
        data = build_operational_dashboard(self.today, clinic_scope=self.fac_a)
        self.assertEqual(data["facilityPerformance"][0]["completionRate"], 50.0)
