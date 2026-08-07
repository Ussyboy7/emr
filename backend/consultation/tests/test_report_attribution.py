"""Report attribution tests.

The ward admission summary must pull pharmacy/lab/radiology orders by the
``admission`` FK (admission is the source of truth), and the consultation
report must pull lab/radiology orders by ``consultation_session``.
"""
from datetime import date, time

from django.test import TestCase

from patients.models import Patient, Visit
from wards.models import PatientAdmission, Ward


class WardSummaryAttributionTest(TestCase):
    def setUp(self):
        self.patient = Patient.objects.create(
            patient_id="ATTR-PT-001",
            surname="Report",
            first_name="Attribution",
            gender="male",
            date_of_birth=date(1980, 1, 1),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(8, 0),
            status="in_progress",
        )
        self.ward = Ward.objects.create(
            ward_code="WARD-ATTR",
            name="Ward Attr",
            total_beds=5,
            occupied_beds=0,
        )
        self.admission = PatientAdmission.objects.create(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward,
            admission_diagnosis="Attribution test",
            status="admitted",
        )
        self.other_admission = PatientAdmission.objects.create(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward,
            admission_diagnosis="Second episode",
            status="admitted",
        )

    def test_wardsummary_pharmacy_uses_admission_fk(self):
        """_load_pharmacy returns only prescriptions tied to this admission."""
        from pharmacy.models import GenericMedication, Prescription, PrescriptionItem

        generic = GenericMedication.objects.create(
            name="Paracetamol",
            strength="500mg",
            dosage_form="tablet",
            route="oral",
        )
        linked = Prescription.objects.create(
            patient=self.patient, admission=self.admission
        )
        other = Prescription.objects.create(
            patient=self.patient, admission=self.other_admission
        )
        for rx in (linked, other):
            PrescriptionItem.objects.create(
                prescription=rx,
                generic=generic,
                quantity=10,
                unit="tablets",
                dose="1 tablet",
                frequency="8 hourly",
                duration="7 days",
                route="Oral",
            )

        from wards.pdfs import _load_pharmacy

        rows = _load_pharmacy(self.admission)
        ids = [r["prescription_id"] for r in rows]

        self.assertIn(linked.prescription_id, ids)
        self.assertNotIn(other.prescription_id, ids)

    def test_wardsummary_lab_and_radiology_use_admission_fk(self):
        """Lab/radiology loaders return only orders tied to this admission."""
        from laboratory.models import LabOrder
        from radiology.models import RadiologyOrder

        linked_lab = LabOrder.objects.create(
            patient=self.patient, admission=self.admission
        )
        other_lab = LabOrder.objects.create(
            patient=self.patient, admission=self.other_admission
        )
        linked_rad = RadiologyOrder.objects.create(
            patient=self.patient, admission=self.admission
        )
        other_rad = RadiologyOrder.objects.create(
            patient=self.patient, admission=self.other_admission
        )

        from wards.pdfs import _load_lab, _load_radiology

        lab_rows = _load_lab(self.admission)
        lab_nos = [r["order_number"] for r in lab_rows]
        self.assertIn(linked_lab.order_id, lab_nos)
        self.assertNotIn(other_lab.order_id, lab_nos)

        rad_rows = _load_radiology(self.admission)
        rad_nos = [r["order_number"] for r in rad_rows]
        self.assertIn(linked_rad.order_id, rad_nos)
        self.assertNotIn(other_rad.order_id, rad_nos)

    def test_wardsummary_loaders_exclude_other_admission_orders(self):
        """Physio/eye/referral loaders are scoped to the admission FK."""
        from django.contrib.auth import get_user_model

        from consultation.models import Referral
        from eyecare.models import EyeOrder
        from physiotherapy.models import PhysioOrder
        from wards.pdfs import _load_eye, _load_physio, _load_referrals

        User = get_user_model()
        doctor = User.objects.create_user(username="attr_doctor", password="x")

        PhysioOrder.objects.create(
            patient=self.patient,
            ordered_by=doctor,
            diagnosis="Linked physio",
            admission=self.admission,
        )
        PhysioOrder.objects.create(
            patient=self.patient,
            ordered_by=doctor,
            diagnosis="Other physio",
            admission=self.other_admission,
        )
        EyeOrder.objects.create(
            patient=self.patient,
            ordered_by=doctor,
            diagnosis="Linked eye",
            admission=self.admission,
        )
        EyeOrder.objects.create(
            patient=self.patient,
            ordered_by=doctor,
            diagnosis="Other eye",
            admission=self.other_admission,
        )
        linked_ref = Referral.objects.create(
            patient=self.patient,
            referred_by=doctor,
            specialty="Cardiology",
            admission=self.admission,
        )
        other_ref = Referral.objects.create(
            patient=self.patient,
            referred_by=doctor,
            specialty="Orthopaedics",
            admission=self.other_admission,
        )

        physio_rows = _load_physio(self.admission)
        self.assertEqual([p["diagnosis"] for p in physio_rows], ["Linked physio"])

        eye_rows = _load_eye(self.admission)
        self.assertEqual([e["diagnosis"] for e in eye_rows], ["Linked eye"])

        ref_rows = _load_referrals(self.admission)
        self.assertEqual([r["referral_id"] for r in ref_rows], [linked_ref.referral_id])
        self.assertNotIn(other_ref.referral_id, [r["referral_id"] for r in ref_rows])


class ConsultationReportScopingTest(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model

        from consultation.models import ConsultationRoom

        self.patient = Patient.objects.create(
            patient_id="ATTR-PT-002",
            surname="Consult",
            first_name="Scope",
            gender="female",
            date_of_birth=date(1990, 2, 2),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(9, 0),
            status="in_progress",
        )
        self.room = ConsultationRoom.objects.create(
            name="Attribution Room",
            room_number="R-ATTR",
        )
        self.doctor = get_user_model().objects.create_user(
            username="attr_consult_doctor", password="x"
        )

    def _make_session(self, **overrides):
        from consultation.models import ConsultationSession

        defaults = {
            "room": self.room,
            "patient": self.patient,
            "doctor": self.doctor,
            "visit": self.visit,
            "status": "active",
        }
        defaults.update(overrides)
        return ConsultationSession.objects.create(**defaults)

    def test_consult_report_lab_scoped_to_session(self):
        """A session-scoped lab order renders in the report; other-session
        lab order on the same visit does not crash the build."""
        from consultation.report_pdf import build_consultation_report_pdf
        from laboratory.models import LabOrder

        session = self._make_session()
        other_session = self._make_session(status="completed")

        LabOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            consultation_session=session,
        )
        LabOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            consultation_session=other_session,
        )

        response = build_consultation_report_pdf(session)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_consult_report_radiology_scoped_to_session(self):
        """Session-scoped radiology order renders without error."""
        from consultation.report_pdf import build_consultation_report_pdf
        from radiology.models import RadiologyOrder

        session = self._make_session()
        RadiologyOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            consultation_session=session,
        )

        response = build_consultation_report_pdf(session)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
