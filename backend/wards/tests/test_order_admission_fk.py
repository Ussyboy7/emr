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

    def test_order_serializers_expose_admission_id(self):
        """Each order serializer read representation surfaces the admission id."""
        from django.contrib.auth import get_user_model

        from consultation.models import Referral
        from eyecare.models import EyeOrder
        from laboratory.models import LabOrder
        from physiotherapy.models import PhysioOrder
        from radiology.models import RadiologyOrder

        from consultation.serializers import ReferralSerializer
        from eyecare.serializers import EyeOrderSerializer
        from laboratory.serializers import LabOrderSerializer
        from physiotherapy.serializers import PhysioOrderSerializer
        from pharmacy.serializers import PrescriptionSerializer
        from radiology.serializers import RadiologyOrderSerializer

        User = get_user_model()
        doctor = User.objects.create_user(username="fk_doctor", password="x")

        lab = LabOrder.objects.create(
            patient=self.patient, admission=self.admission
        )
        rad = RadiologyOrder.objects.create(
            patient=self.patient, admission=self.admission
        )
        physio = PhysioOrder.objects.create(
            patient=self.patient,
            ordered_by=doctor,
            diagnosis="Physio test",
            admission=self.admission,
        )
        eye = EyeOrder.objects.create(
            patient=self.patient,
            ordered_by=doctor,
            admission=self.admission,
        )
        referral = Referral.objects.create(
            patient=self.patient,
            referred_by=doctor,
            admission=self.admission,
        )
        rx = Prescription.objects.create(
            patient=self.patient,
            admission=self.admission,
        )

        cases = [
            (PrescriptionSerializer(rx), "rx"),
            (LabOrderSerializer(lab), "lab"),
            (RadiologyOrderSerializer(rad), "radiology"),
            (PhysioOrderSerializer(physio), "physio"),
            (EyeOrderSerializer(eye), "eye"),
            (ReferralSerializer(referral), "referral"),
        ]
        for serialized, label in cases:
            self.assertEqual(
                serialized.data["admission"],
                self.admission.pk,
                f"{label} serializer should expose admission id",
            )

    def test_order_serializers_accept_admission_on_create(self):
        """Create serializers accept an optional admission id and persist it."""
        from django.contrib.auth import get_user_model

        from eyecare.serializers import EyeOrderCreateSerializer
        from physiotherapy.serializers import PhysioOrderCreateSerializer

        User = get_user_model()
        doctor = User.objects.create_user(username="fk_doctor2", password="x")

        physio = PhysioOrderCreateSerializer(
            data={
                "patient": self.patient.pk,
                "diagnosis": "Physio create test",
                "admission": self.admission.pk,
            }
        )
        self.assertTrue(physio.is_valid(), physio.errors)
        self.assertEqual(physio.validated_data["admission"], self.admission)
        physio.validated_data["ordered_by"] = doctor
        physio_res = physio.save()
        self.assertEqual(physio_res.admission_id, self.admission.pk)

        eye = EyeOrderCreateSerializer(
            data={
                "patient": self.patient.pk,
                "admission": self.admission.pk,
            }
        )
        self.assertTrue(eye.is_valid(), eye.errors)
        self.assertEqual(eye.validated_data["admission"], self.admission)
        eye.validated_data["ordered_by"] = doctor
        eye_res = eye.save()
        self.assertEqual(eye_res.admission_id, self.admission.pk)
