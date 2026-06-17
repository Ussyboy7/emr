"""Comprehensive API tests for the Wards module: wards, beds, admissions,
discharges, transfers, and bed assignments."""
from datetime import date, time

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from patients.models import Patient, Visit
from wards.models import Ward, Bed, PatientAdmission

User = get_user_model()

WARDS_URL = "/api/v1/wards/"
BEDS_URL = "/api/v1/beds/"
ADMISSIONS_URL = "/api/v1/admissions/"


class WardsSetupMixin:
    """Shared setUp: superuser, patient, visit, ward, and bed."""

    def setUp(self):
        self.user = User.objects.create_superuser(
            username="ward_tester",
            password="testpass123",
            email="ward_tester@test.local",
            first_name="Ward",
            last_name="Tester",
        )
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            patient_id="WD-PT-001",
            surname="Mensah",
            first_name="Kofi",
            gender="male",
            date_of_birth=date(1988, 4, 12),
        )
        self.patient2 = Patient.objects.create(
            patient_id="WD-PT-002",
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
        self.ward = Ward.objects.create(
            ward_code="WD-GEN-01",
            name="General Male Ward",
            ward_type="general",
            total_beds=20,
            floor="Ground",
            building="Main Block",
        )
        self.ward2 = Ward.objects.create(
            ward_code="WD-SUR-01",
            name="Surgical Ward",
            ward_type="surgical",
            total_beds=15,
            floor="First",
            building="Main Block",
        )
        self.bed = Bed.objects.create(
            ward=self.ward,
            bed_number="G-01",
            bed_type="standard",
            status="available",
        )
        self.bed2 = Bed.objects.create(
            ward=self.ward,
            bed_number="G-02",
            bed_type="standard",
            status="available",
        )
        self.bed_ward2 = Bed.objects.create(
            ward=self.ward2,
            bed_number="S-01",
            bed_type="standard",
            status="available",
        )

    def _ward_payload(self, **overrides):
        defaults = {
            "ward_code": "WD-NEW-01",
            "name": "New Ward",
            "ward_type": "medical",
            "total_beds": 10,
            "floor": "Second",
            "building": "East Wing",
        }
        defaults.update(overrides)
        return defaults

    def _bed_payload(self, **overrides):
        defaults = {
            "ward": self.ward.pk,
            "bed_number": "G-99",
            "bed_type": "standard",
        }
        defaults.update(overrides)
        return defaults

    def _admission_payload(self, **overrides):
        defaults = {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "ward": self.ward.pk,
            "bed": self.bed.pk,
            "admission_type": "elective",
            "admission_diagnosis": "Observation for chest pain",
        }
        defaults.update(overrides)
        return defaults

    def _create_admission(self, **overrides):
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


# ── Ward CRUD ────────────────────────────────────────────────────────────────


class WardCreateTests(WardsSetupMixin, APITestCase):
    """POST /api/v1/wards/"""

    def test_create_ward_returns_201(self):
        resp = self.client.post(WARDS_URL, self._ward_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["ward_code"], "WD-NEW-01")
        self.assertEqual(resp.data["name"], "New Ward")
        self.assertEqual(resp.data["ward_type"], "medical")

    def test_create_ward_sets_created_by(self):
        resp = self.client.post(WARDS_URL, self._ward_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["created_by"], self.user.pk)

    def test_create_ward_duplicate_code_returns_400(self):
        resp = self.client.post(
            WARDS_URL,
            self._ward_payload(ward_code=self.ward.ward_code),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_ward_without_required_fields_returns_400(self):
        resp = self.client.post(WARDS_URL, {"floor": "Third"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class WardListTests(WardsSetupMixin, APITestCase):
    """GET /api/v1/wards/"""

    def test_list_wards(self):
        resp = self.client.get(WARDS_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        codes = [w["ward_code"] for w in results]
        self.assertIn(self.ward.ward_code, codes)
        self.assertIn(self.ward2.ward_code, codes)

    def test_list_wards_filter_by_type(self):
        resp = self.client.get(WARDS_URL, {"ward_type": "surgical"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        for w in results:
            self.assertEqual(w["ward_type"], "surgical")

    def test_list_wards_search_by_name(self):
        resp = self.client.get(WARDS_URL, {"search": "Surgical"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertTrue(any("Surgical" in w["name"] for w in results))


class WardRetrieveTests(WardsSetupMixin, APITestCase):
    """GET /api/v1/wards/{id}/"""

    def test_retrieve_ward(self):
        resp = self.client.get(f"{WARDS_URL}{self.ward.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], self.ward.pk)
        self.assertEqual(resp.data["ward_code"], self.ward.ward_code)
        self.assertIn("available_beds", resp.data)
        self.assertIn("occupancy_rate", resp.data)
        self.assertIn("beds_count", resp.data)

    def test_retrieve_nonexistent_ward_returns_404(self):
        resp = self.client.get(f"{WARDS_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class WardUpdateTests(WardsSetupMixin, APITestCase):
    """PATCH /api/v1/wards/{id}/"""

    def test_patch_ward_name(self):
        resp = self.client.patch(
            f"{WARDS_URL}{self.ward.pk}/",
            {"name": "General Male Ward (Renamed)"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "General Male Ward (Renamed)")

    def test_patch_ward_status(self):
        resp = self.client.patch(
            f"{WARDS_URL}{self.ward.pk}/",
            {"status": "maintenance"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "maintenance")


class WardOccupancyTests(WardsSetupMixin, APITestCase):
    """GET /api/v1/wards/{id}/occupancy/"""

    def test_ward_occupancy_endpoint(self):
        resp = self.client.get(f"{WARDS_URL}{self.ward.pk}/occupancy/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["ward_code"], self.ward.ward_code)
        self.assertEqual(resp.data["total_beds"], self.ward.total_beds)
        self.assertIn("available_beds", resp.data)
        self.assertIn("occupancy_rate", resp.data)


class WardBedsActionTests(WardsSetupMixin, APITestCase):
    """GET /api/v1/wards/{id}/beds/"""

    def test_ward_beds_action(self):
        resp = self.client.get(f"{WARDS_URL}{self.ward.pk}/beds/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        bed_numbers = [b["bed_number"] for b in resp.data]
        self.assertIn("G-01", bed_numbers)
        self.assertIn("G-02", bed_numbers)
        self.assertNotIn("S-01", bed_numbers)


# ── Bed CRUD ─────────────────────────────────────────────────────────────────


class BedCreateTests(WardsSetupMixin, APITestCase):
    """POST /api/v1/beds/"""

    def test_create_bed_returns_201(self):
        resp = self.client.post(BEDS_URL, self._bed_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["bed_number"], "G-99")
        self.assertEqual(resp.data["ward"], self.ward.pk)

    def test_create_bed_duplicate_in_ward_returns_400(self):
        resp = self.client.post(
            BEDS_URL,
            self._bed_payload(bed_number=self.bed.bed_number),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_bed_without_ward_returns_400(self):
        payload = self._bed_payload()
        del payload["ward"]
        resp = self.client.post(BEDS_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class BedListTests(WardsSetupMixin, APITestCase):
    """GET /api/v1/beds/"""

    def test_list_beds(self):
        resp = self.client.get(BEDS_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertGreaterEqual(len(results), 3)

    def test_list_beds_filter_by_ward(self):
        resp = self.client.get(BEDS_URL, {"ward": self.ward.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        for b in results:
            self.assertEqual(b["ward"], self.ward.pk)

    def test_list_beds_filter_by_status(self):
        resp = self.client.get(BEDS_URL, {"status": "available"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        for b in results:
            self.assertEqual(b["status"], "available")


class BedRetrieveTests(WardsSetupMixin, APITestCase):
    """GET /api/v1/beds/{id}/"""

    def test_retrieve_bed(self):
        resp = self.client.get(f"{BEDS_URL}{self.bed.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], self.bed.pk)
        self.assertEqual(resp.data["bed_number"], self.bed.bed_number)
        self.assertIn("ward_name", resp.data)

    def test_retrieve_nonexistent_bed_returns_404(self):
        resp = self.client.get(f"{BEDS_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class BedUpdateTests(WardsSetupMixin, APITestCase):
    """PATCH /api/v1/beds/{id}/"""

    def test_patch_bed_status(self):
        resp = self.client.patch(
            f"{BEDS_URL}{self.bed.pk}/",
            {"status": "maintenance"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "maintenance")

    def test_patch_bed_type(self):
        resp = self.client.patch(
            f"{BEDS_URL}{self.bed.pk}/",
            {"bed_type": "icu"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["bed_type"], "icu")


# ── Admission CRUD ───────────────────────────────────────────────────────────


class AdmissionCreateTests(WardsSetupMixin, APITestCase):
    """POST /api/v1/admissions/"""

    def test_create_admission_returns_201(self):
        resp = self.client.post(
            ADMISSIONS_URL, self._admission_payload(), format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["patient"], self.patient.pk)
        self.assertEqual(resp.data["ward"], self.ward.pk)
        self.assertEqual(resp.data["status"], "admitted")
        self.assertTrue(resp.data["admission_id"].startswith("ADM-"))

    def test_create_admission_sets_created_by(self):
        resp = self.client.post(
            ADMISSIONS_URL, self._admission_payload(), format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["created_by"], self.user.pk)

    def test_create_admission_missing_required_fields_returns_400(self):
        resp = self.client.post(
            ADMISSIONS_URL, {"admission_notes": "incomplete"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_admission_missing_diagnosis_returns_400(self):
        payload = self._admission_payload()
        del payload["admission_diagnosis"]
        resp = self.client.post(ADMISSIONS_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_admission_with_emergency_type(self):
        resp = self.client.post(
            ADMISSIONS_URL,
            self._admission_payload(admission_type="emergency"),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["admission_type"], "emergency")


class AdmissionRetrieveTests(WardsSetupMixin, APITestCase):
    """GET /api/v1/admissions/{id}/"""

    def test_retrieve_admission(self):
        admission = self._create_admission()
        resp = self.client.get(f"{ADMISSIONS_URL}{admission.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], admission.pk)
        self.assertIn("patient_name", resp.data)
        self.assertIn("ward_name", resp.data)
        self.assertIn("length_of_stay", resp.data)
        self.assertIn("is_active", resp.data)

    def test_retrieve_nonexistent_admission_returns_404(self):
        resp = self.client.get(f"{ADMISSIONS_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class AdmissionListTests(WardsSetupMixin, APITestCase):
    """GET /api/v1/admissions/"""

    def setUp(self):
        super().setUp()
        self.adm1 = self._create_admission()
        self.adm2 = self._create_admission(
            patient=self.patient2,
            visit=self.visit2,
            ward=self.ward2,
            admission_diagnosis="Appendicitis",
        )
        self.adm_discharged = self._create_admission(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward2,
            admission_diagnosis="Resolved malaria",
            status="discharged",
        )

    def test_list_all_admissions(self):
        resp = self.client.get(ADMISSIONS_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 3)

    def test_filter_admissions_by_patient(self):
        resp = self.client.get(ADMISSIONS_URL, {"patient": self.patient.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        for item in results:
            self.assertEqual(item["patient"], self.patient.pk)

    def test_filter_admissions_by_ward(self):
        resp = self.client.get(ADMISSIONS_URL, {"ward": self.ward.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        for item in results:
            self.assertEqual(item["ward"], self.ward.pk)

    def test_filter_admissions_by_status(self):
        resp = self.client.get(ADMISSIONS_URL, {"status": "admitted"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        for item in results:
            self.assertEqual(item["status"], "admitted")
        ids = [item["id"] for item in results]
        self.assertIn(self.adm1.pk, ids)
        self.assertNotIn(self.adm_discharged.pk, ids)

    def test_filter_admissions_by_status_in(self):
        resp = self.client.get(
            ADMISSIONS_URL, {"status_in": "admitted,pending_discharge"}
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        for item in results:
            self.assertIn(item["status"], ("admitted", "pending_discharge"))

    def test_search_admissions_by_diagnosis(self):
        resp = self.client.get(ADMISSIONS_URL, {"search": "Appendicitis"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertTrue(
            any("Appendicitis" in r.get("admission_diagnosis", "") for r in results)
        )


# ── Discharge ────────────────────────────────────────────────────────────────


class DischargeTests(WardsSetupMixin, APITestCase):
    """Discharge workflows via /api/v1/admissions/{id}/discharge/ and
    /api/v1/admissions/{id}/initiate_discharge/."""

    def test_initiate_discharge_sets_pending(self):
        admission = self._create_admission()
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/initiate_discharge/",
            {
                "discharge_diagnosis": "Resolved condition",
                "discharge_type": "regular",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        admission.refresh_from_db()
        self.assertEqual(admission.status, "pending_discharge")
        self.assertEqual(admission.discharge_diagnosis, "Resolved condition")

    def test_initiate_discharge_requires_diagnosis(self):
        admission = self._create_admission()
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/initiate_discharge/",
            {"discharge_type": "regular"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_initiate_discharge_rejects_non_admitted(self):
        admission = self._create_admission(status="discharged")
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/initiate_discharge/",
            {
                "discharge_diagnosis": "X",
                "discharge_type": "regular",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_direct_discharge_from_admitted(self):
        admission = self._create_admission()
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/discharge/",
            {
                "discharge_diagnosis": "Fully recovered",
                "discharge_type": "regular",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        admission.refresh_from_db()
        self.assertEqual(admission.status, "discharged")
        self.assertIsNotNone(admission.discharge_date)

    def test_two_step_discharge(self):
        admission = self._create_admission()
        # Step 1: doctor initiates
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/initiate_discharge/",
            {
                "discharge_diagnosis": "Recovering well",
                "discharge_type": "regular",
                "discharge_summary": "Patient stable",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Step 2: nurse confirms
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/discharge/",
            {
                "nurse_exit_summary": "Patient alert, vitals stable, IV removed",
                "discharged_with": "family",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        admission.refresh_from_db()
        self.assertEqual(admission.status, "discharged")
        self.assertEqual(admission.nurse_exit_summary, "Patient alert, vitals stable, IV removed")

    def test_nurse_step2_requires_exit_summary(self):
        admission = self._create_admission(status="pending_discharge")
        admission.discharge_diagnosis = "Treated"
        admission.save(update_fields=["discharge_diagnosis"])
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/discharge/",
            {"discharged_with": "self"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_discharge_already_discharged(self):
        admission = self._create_admission(status="discharged")
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/discharge/",
            {"discharge_diagnosis": "X"},
            format="json",
        )
        self.assertIn(
            resp.status_code,
            [status.HTTP_400_BAD_REQUEST, status.HTTP_500_INTERNAL_SERVER_ERROR],
        )

    def test_discharge_frees_bed(self):
        admission = self._create_admission(bed=self.bed)
        self.bed.status = "occupied"
        self.bed.current_patient = self.patient
        self.bed.save()

        self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/discharge/",
            {
                "discharge_diagnosis": "Recovered",
                "discharge_type": "regular",
            },
            format="json",
        )
        self.bed.refresh_from_db()
        self.assertEqual(self.bed.status, "available")
        self.assertIsNone(self.bed.current_patient)


# ── Transfer ─────────────────────────────────────────────────────────────────


class TransferTests(WardsSetupMixin, APITestCase):
    """POST /api/v1/admissions/{id}/transfer/"""

    def test_transfer_to_another_ward(self):
        admission = self._create_admission()
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/transfer/",
            {
                "new_ward_id": self.ward2.pk,
                "transfer_reason": "Requires surgical intervention",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        admission.refresh_from_db()
        self.assertEqual(admission.status, "transferred")
        self.assertEqual(admission.transfer_to_ward_id, self.ward2.pk)
        self.assertEqual(admission.transfer_reason, "Requires surgical intervention")

    def test_transfer_requires_new_ward_id(self):
        admission = self._create_admission()
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/transfer/",
            {"transfer_reason": "Some reason"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_transfer_nonexistent_ward_returns_404(self):
        admission = self._create_admission()
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/transfer/",
            {"new_ward_id": 99999},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ── Bed Assignment via Admission ─────────────────────────────────────────────


class BedAssignmentTests(WardsSetupMixin, APITestCase):
    """POST /api/v1/admissions/{id}/assign_bed/"""

    def test_assign_bed_to_admission(self):
        admission = self._create_admission()
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/assign_bed/",
            {"bed_id": self.bed.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        admission.refresh_from_db()
        self.assertEqual(admission.bed_id, self.bed.pk)
        self.bed.refresh_from_db()
        self.assertEqual(self.bed.status, "occupied")
        self.assertEqual(self.bed.current_patient_id, self.patient.pk)

    def test_reassign_bed_frees_old_bed(self):
        admission = self._create_admission(bed=self.bed)
        self.bed.status = "occupied"
        self.bed.current_patient = self.patient
        self.bed.save()

        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/assign_bed/",
            {"bed_id": self.bed2.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.bed.refresh_from_db()
        self.assertEqual(self.bed.status, "available")
        self.assertIsNone(self.bed.current_patient)
        self.bed2.refresh_from_db()
        self.assertEqual(self.bed2.status, "occupied")

    def test_assign_bed_from_wrong_ward_returns_400(self):
        admission = self._create_admission()
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/assign_bed/",
            {"bed_id": self.bed_ward2.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_assign_nonexistent_bed_returns_404(self):
        admission = self._create_admission()
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/assign_bed/",
            {"bed_id": 99999},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_remove_bed_assignment(self):
        admission = self._create_admission(bed=self.bed)
        self.bed.status = "occupied"
        self.bed.current_patient = self.patient
        self.bed.save()

        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/assign_bed/",
            {"bed_id": None},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        admission.refresh_from_db()
        self.assertIsNone(admission.bed)
        self.bed.refresh_from_db()
        self.assertEqual(self.bed.status, "available")


# ── Admission List Stats ─────────────────────────────────────────────────────


class AdmissionListStatsTests(WardsSetupMixin, APITestCase):
    """GET /api/v1/admissions/list-stats/"""

    def test_list_stats(self):
        self._create_admission()
        self._create_admission(
            patient=self.patient2,
            visit=self.visit2,
            ward=self.ward2,
            admission_diagnosis="Fracture",
        )
        resp = self.client.get(f"{ADMISSIONS_URL}list-stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("total", resp.data)
        self.assertIn("admitted", resp.data)
        self.assertIn("pending_discharge", resp.data)
        self.assertGreaterEqual(resp.data["total"], 2)
        self.assertGreaterEqual(resp.data["admitted"], 2)


# ── Authentication ───────────────────────────────────────────────────────────


class WardsAuthTests(WardsSetupMixin, APITestCase):
    """Unauthenticated requests must return 401."""

    def test_list_wards_unauthenticated(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(WARDS_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_ward_unauthenticated(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(WARDS_URL, self._ward_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_beds_unauthenticated(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(BEDS_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_bed_unauthenticated(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(BEDS_URL, self._bed_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_admissions_unauthenticated(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(ADMISSIONS_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_admission_unauthenticated(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(ADMISSIONS_URL, self._admission_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_ward_unauthenticated(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(f"{WARDS_URL}{self.ward.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_discharge_unauthenticated(self):
        admission = self._create_admission()
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/discharge/",
            {"discharge_diagnosis": "X"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_transfer_unauthenticated(self):
        admission = self._create_admission()
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            f"{ADMISSIONS_URL}{admission.pk}/transfer/",
            {"new_ward_id": self.ward2.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
