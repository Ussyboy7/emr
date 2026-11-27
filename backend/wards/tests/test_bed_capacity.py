"""Bed capacity, admission-backed bed actions, and orphan-state guards."""
from datetime import date, time
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APITestCase

from patients.models import Patient, Visit
from wards.models import Bed, PatientAdmission, Ward

User = get_user_model()

WARDS_URL = "/api/v1/wards/"
BEDS_URL = "/api/v1/beds/"
ADMISSIONS_URL = "/api/v1/admissions/"


class BedCapacityTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            username="bed_capacity_tester",
            password="testpass123",
            email="bed_capacity@test.local",
        )
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            patient_id="CAP-PT-001",
            surname="Mensah",
            first_name="Kofi",
            gender="male",
            date_of_birth=date(1988, 4, 12),
        )
        self.patient2 = Patient.objects.create(
            patient_id="CAP-PT-002",
            surname="Aidoo",
            first_name="Ama",
            gender="female",
            date_of_birth=date(1995, 9, 3),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(9, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )
        self.visit2 = Visit.objects.create(
            patient=self.patient2,
            date=date.today(),
            time=time(10, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )
        # Fully configured: two licensed beds and two bed rows.
        self.ward = Ward.objects.create(
            ward_code="CAP-01",
            name="Capacity Ward",
            ward_type="general",
            total_beds=2,
        )
        self.bed1 = Bed.objects.create(
            ward=self.ward, bed_number="C-01", bed_type="standard", status="available"
        )
        self.bed2 = Bed.objects.create(
            ward=self.ward, bed_number="C-02", bed_type="standard", status="available"
        )

    def _admission(self, **overrides) -> PatientAdmission:
        defaults = {
            "patient": self.patient,
            "visit": self.visit,
            "ward": self.ward,
            "admission_diagnosis": "Observation",
            "status": "admitted",
            "created_by": self.user,
        }
        defaults.update(overrides)
        return PatientAdmission.objects.create(**defaults)

    def _occupy(self, bed: Bed, patient: Patient) -> None:
        bed.current_patient = patient
        bed.status = "occupied"
        bed.admission_date = date.today()
        bed.save(update_fields=["current_patient", "status", "admission_date"])

    def test_available_beds_uses_free_rows_for_a_configured_ward(self):
        self._occupy(self.bed1, self.patient2)

        resp = self.client.get(f"{WARDS_URL}{self.ward.pk}/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["available_bed_rows"], 1)
        self.assertEqual(resp.data["available_beds"], 1)

    def test_available_beds_falls_back_to_licensed_counter_for_an_incomplete_ward(self):
        ward = Ward.objects.create(
            ward_code="CAP-02",
            name="Under-configured Ward",
            ward_type="general",
            total_beds=5,
        )
        Bed.objects.create(ward=ward, bed_number="U-01", status="available")

        resp = self.client.get(f"{WARDS_URL}{ward.pk}/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["available_bed_rows"], 1)
        self.assertEqual(resp.data["available_beds"], 5)

    def test_admission_is_rejected_when_a_configured_ward_has_no_free_rows(self):
        self._occupy(self.bed1, self.patient2)
        self._occupy(self.bed2, self.patient2)
        # Prove the row check wins over a stale/zero counter.
        self.ward.occupied_beds = 0
        self.ward.save(update_fields=["occupied_beds"])

        resp = self.client.post(
            ADMISSIONS_URL,
            {
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "ward": self.ward.pk,
                "admission_type": "elective",
                "admission_diagnosis": "Observation",
            },
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ward", resp.data)

    def test_bed_assign_requires_an_active_admission(self):
        resp = self.client.post(
            f"{BEDS_URL}{self.bed1.pk}/assign_patient/",
            {"patient_id": self.patient2.pk},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.bed1.refresh_from_db()
        self.assertEqual(self.bed1.status, "available")
        self.assertIsNone(self.bed1.current_patient_id)

    def test_bed_assign_links_the_active_admission(self):
        admission = self._admission()

        resp = self.client.post(
            f"{BEDS_URL}{self.bed1.pk}/assign_patient/",
            {"patient_id": self.patient.pk},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        admission.refresh_from_db()
        self.bed1.refresh_from_db()
        self.ward.refresh_from_db()
        self.assertEqual(admission.bed_id, self.bed1.pk)
        self.assertEqual(self.bed1.status, "occupied")
        self.assertEqual(self.bed1.current_patient_id, self.patient.pk)
        self.assertEqual(self.ward.occupied_beds, 1)

    def test_bed_discharge_releases_the_bed_and_keeps_the_admission_active(self):
        admission = self._admission(bed=self.bed1)
        self._occupy(self.bed1, self.patient)
        self.ward.occupied_beds = 1
        self.ward.save(update_fields=["occupied_beds"])

        resp = self.client.post(
            f"{BEDS_URL}{self.bed1.pk}/discharge_patient/",
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        admission.refresh_from_db()
        self.bed1.refresh_from_db()
        self.ward.refresh_from_db()
        self.assertEqual(admission.status, "admitted")
        self.assertIsNone(admission.bed_id)
        self.assertEqual(self.bed1.status, "available")
        self.assertIsNone(self.bed1.current_patient_id)
        self.assertEqual(self.ward.occupied_beds, 0)

    def test_bed_discharge_without_an_active_admission_is_rejected(self):
        resp = self.client.post(
            f"{BEDS_URL}{self.bed1.pk}/discharge_patient/",
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bed_status_cannot_be_set_to_occupied_directly(self):
        resp = self.client.patch(
            f"{BEDS_URL}{self.bed1.pk}/",
            {"status": "occupied"},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.bed1.refresh_from_db()
        self.assertEqual(self.bed1.status, "available")

    def test_occupied_bed_cannot_be_freed_while_an_admission_is_active(self):
        admission = self._admission(bed=self.bed1)
        self._occupy(self.bed1, self.patient)
        self.ward.occupied_beds = 1
        self.ward.save(update_fields=["occupied_beds"])

        resp = self.client.patch(
            f"{BEDS_URL}{self.bed1.pk}/",
            {"status": "available"},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        admission.refresh_from_db()
        self.bed1.refresh_from_db()
        self.assertEqual(admission.bed_id, self.bed1.pk)
        self.assertEqual(self.bed1.status, "occupied")

    def test_admission_update_cannot_change_bed_directly(self):
        admission = self._admission()

        resp = self.client.patch(
            f"{ADMISSIONS_URL}{admission.pk}/",
            {"bed": self.bed1.pk},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        admission.refresh_from_db()
        self.assertIsNone(admission.bed_id)
        self.bed1.refresh_from_db()
        self.assertEqual(self.bed1.status, "available")

    def test_bed_cannot_be_created_as_occupied_directly(self):
        resp = self.client.post(
            BEDS_URL,
            {
                "ward": self.ward.pk,
                "bed_number": "C-03",
                "status": "occupied",
            },
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Bed.objects.filter(bed_number="C-03").exists())

    def test_bed_with_active_admission_cannot_be_deleted(self):
        admission = self._admission(bed=self.bed1)
        self._occupy(self.bed1, self.patient)

        resp = self.client.delete(f"{BEDS_URL}{self.bed1.pk}/")

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Bed.objects.filter(pk=self.bed1.pk).exists())
        admission.refresh_from_db()
        self.assertEqual(admission.bed_id, self.bed1.pk)

    def test_stale_bed_repair_reoccupies_free_rows_referenced_by_active_admissions(self):
        admission = self._admission(bed=self.bed1)
        output = StringIO()

        call_command("fix_stale_beds", apply=True, stdout=output)

        self.bed1.refresh_from_db()
        self.ward.refresh_from_db()
        self.assertEqual(self.bed1.status, "occupied")
        self.assertEqual(self.bed1.current_patient_id, admission.patient_id)
        self.assertEqual(self.ward.occupied_beds, 1)

    def test_patient_discharge_keeps_bed_history_but_frees_the_row(self):
        admission = self._admission(bed=self.bed1)
        self._occupy(self.bed1, self.patient)
        self.ward.occupied_beds = 1
        self.ward.save(update_fields=["occupied_beds"])

        admission.discharge_patient(discharge_type="regular")

        admission.refresh_from_db()
        self.bed1.refresh_from_db()
        self.ward.refresh_from_db()
        self.assertEqual(admission.status, "discharged")
        self.assertEqual(admission.bed_id, self.bed1.pk)
        self.assertEqual(self.bed1.status, "available")
        self.assertIsNone(self.bed1.current_patient_id)
        self.assertEqual(self.ward.occupied_beds, 0)
