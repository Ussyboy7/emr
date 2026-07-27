"""Ward discharge and transfer API tests."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user, create_test_patient_visit
from wards.models import Ward, PatientAdmission


class WardDischargeTest(APITestCase):
    """Two-step discharge: initiate_discharge → discharge."""

    @classmethod
    def setUpTestData(cls):
        cls.doctor = create_test_user("ward_dr", pages=["/consultation/wards", "/nursing/wards"], system_role="Medical Doctor")
        cls.nurse = create_test_user("ward_nurse", pages=["/nursing/wards"], system_role="Nursing Officer")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="WARD-DC-01")
        cls.ward = Ward.objects.create(name="General Male", ward_code="GM1", ward_type="general", total_beds=10)

    def setUp(self):
        self.client.force_authenticate(user=self.doctor)
        self.admission = PatientAdmission.objects.create(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward,
            admission_diagnosis="Pneumonia",
            created_by=self.doctor,
        )

    def test_initiate_discharge(self):
        resp = self.client.post(f"/api/v1/admissions/{self.admission.pk}/initiate_discharge/", {
            "discharge_diagnosis": "Resolved pneumonia",
            "discharge_type": "regular",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.admission.refresh_from_db()
        self.assertEqual(self.admission.status, "pending_discharge")

    def test_direct_discharge(self):
        resp = self.client.post(f"/api/v1/admissions/{self.admission.pk}/discharge/", {
            "discharge_diagnosis": "Resolved",
            "discharge_type": "regular",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.admission.refresh_from_db()
        self.assertEqual(self.admission.status, "discharged")

    def test_cannot_discharge_already_discharged(self):
        self.admission.status = "discharged"
        self.admission.save()
        resp = self.client.post(f"/api/v1/admissions/{self.admission.pk}/discharge/", {
            "discharge_diagnosis": "X",
        }, format="json")
        self.assertIn(resp.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT])

    def test_nurse_cannot_initiate_discharge(self):
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(f"/api/v1/admissions/{self.admission.pk}/initiate_discharge/", {
            "discharge_diagnosis": "Resolved pneumonia",
            "discharge_type": "regular",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_doctor_cannot_confirm_pending_discharge_step_two(self):
        self.client.post(f"/api/v1/admissions/{self.admission.pk}/initiate_discharge/", {
            "discharge_diagnosis": "Resolved pneumonia",
            "discharge_type": "regular",
        }, format="json")
        resp = self.client.post(f"/api/v1/admissions/{self.admission.pk}/discharge/", {
            "nurse_exit_summary": "Patient stable at handoff.",
            "discharged_with": "family",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_nurse_can_confirm_pending_discharge_step_two(self):
        self.client.post(f"/api/v1/admissions/{self.admission.pk}/initiate_discharge/", {
            "discharge_diagnosis": "Resolved pneumonia",
            "discharge_type": "regular",
        }, format="json")
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(f"/api/v1/admissions/{self.admission.pk}/discharge/", {
            "nurse_exit_summary": "Patient stable at handoff.",
            "discharged_with": "family",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class WardTransferTest(APITestCase):
    """POST /api/v1/admissions/{id}/transfer/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("ward_transfer", pages=["/consultation/wards", "/nursing/wards"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="WARD-TX-01")
        cls.ward_a = Ward.objects.create(name="Ward A", ward_code="WA", ward_type="general", total_beds=5)
        cls.ward_b = Ward.objects.create(name="Ward B", ward_code="WB", ward_type="surgical", total_beds=5)

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.admission = PatientAdmission.objects.create(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward_a,
            admission_diagnosis="Appendicitis",
            created_by=self.user,
        )

    def test_transfer_to_another_ward(self):
        resp = self.client.post(f"/api/v1/admissions/{self.admission.pk}/transfer/", {
            "new_ward_id": self.ward_b.pk,
            "transfer_reason": "Needs surgical care",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.admission.refresh_from_db()
        self.assertEqual(self.admission.status, "admitted")
        self.assertEqual(self.admission.ward_id, self.ward_b.pk)
        self.assertEqual(self.admission.transfer_to_ward_id, self.ward_b.pk)


class WardBedAssignmentTest(APITestCase):
    """POST /api/v1/admissions/{id}/assign_bed/"""

    @classmethod
    def setUpTestData(cls):
        from wards.models import Bed
        cls.user = create_test_user("ward_bed", pages=["/nursing/wards"], system_role="Nursing Officer")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="WARD-BED-01")
        cls.ward = Ward.objects.create(name="Ward Beds", ward_code="WBD", ward_type="general", total_beds=5)
        cls.bed = Bed.objects.create(ward=cls.ward, bed_number="B-01", bed_type="standard", status="available")

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.admission = PatientAdmission.objects.create(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward,
            admission_diagnosis="Observation",
            created_by=self.user,
        )

    def test_assign_bed(self):
        resp = self.client.post(f"/api/v1/admissions/{self.admission.pk}/assign_bed/", {
            "bed_id": self.bed.pk,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
