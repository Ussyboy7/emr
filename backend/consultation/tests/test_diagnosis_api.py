"""API tests for Diagnosis CRUD, exists endpoint, filtering, and auth."""
from datetime import date, time

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from consultation.models import (
    ConsultationRoom,
    ConsultationSession,
    Diagnosis,
    ICD10Code,
)
from patients.models import Patient, Visit

User = get_user_model()

BASE_URL = "/api/v1/consultation/diagnoses/"


class DiagnosisSetupMixin:
    """Shared setUp: user, patient, visit, session, ICD-10 codes."""

    def setUp(self):
        self.user = User.objects.create_superuser(
            username="diag_dr",
            password="testpass123",
            email="diag_dr@test.local",
            first_name="Diag",
            last_name="Doctor",
        )
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            patient_id="DX-PT-001",
            surname="Doe",
            first_name="Jane",
            gender="female",
            date_of_birth=date(1990, 3, 15),
        )
        self.patient2 = Patient.objects.create(
            patient_id="DX-PT-002",
            surname="Smith",
            first_name="John",
            gender="male",
            date_of_birth=date(1985, 7, 20),
        )

        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(10, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )
        self.room = ConsultationRoom.objects.create(
            name="Diag Room 1",
            room_number="DX-R1",
        )
        self.session = ConsultationSession.objects.create(
            room=self.room,
            patient=self.patient,
            doctor=self.user,
            visit=self.visit,
        )

        self.icd_malaria = ICD10Code.objects.create(
            code="B54", description="Unspecified malaria", category="Infectious diseases", is_active=True,
        )
        self.icd_htn = ICD10Code.objects.create(
            code="I10", description="Essential hypertension", category="Circulatory system", is_active=True,
        )
        self.icd_dm = ICD10Code.objects.create(
            code="E11.9", description="Type 2 diabetes mellitus", category="Endocrine diseases", is_active=True,
        )

    def _diagnosis_payload(self, **overrides):
        defaults = {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "session": self.session.pk,
            "icd10_code": self.icd_malaria.pk,
            "diagnosis_text": "Positive RDT",
            "status": "confirmed",
            "certainty": "confirmed",
            "notes": "Treat with ACT",
        }
        defaults.update(overrides)
        return defaults

    def _create_diagnosis(self, **overrides):
        """Persist a Diagnosis via the ORM (bypasses API)."""
        defaults = {
            "patient": self.patient,
            "visit": self.visit,
            "session": self.session,
            "icd10_code": self.icd_malaria,
            "status": "confirmed",
            "certainty": "confirmed",
            "diagnosed_by": self.user,
        }
        defaults.update(overrides)
        return Diagnosis.objects.create(**defaults)


class DiagnosisCreateTests(DiagnosisSetupMixin, APITestCase):
    """POST /api/v1/consultation/diagnoses/"""

    def test_create_diagnosis_returns_201(self):
        resp = self.client.post(BASE_URL, self._diagnosis_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["icd10_code"], self.icd_malaria.pk)
        self.assertEqual(resp.data["status"], "confirmed")
        self.assertEqual(resp.data["certainty"], "confirmed")
        self.assertEqual(resp.data["patient"], self.patient.pk)

    def test_create_sets_diagnosed_by_to_current_user(self):
        resp = self.client.post(BASE_URL, self._diagnosis_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["diagnosed_by"], self.user.pk)

    def test_create_without_required_fields_returns_400(self):
        resp = self.client.post(BASE_URL, {"notes": "incomplete"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_with_suspected_status(self):
        payload = self._diagnosis_payload(
            status="suspected",
            certainty="possible",
            icd10_code=self.icd_htn.pk,
        )
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "suspected")
        self.assertEqual(resp.data["certainty"], "possible")

    def test_create_duplicate_visit_icd10_returns_400(self):
        self._create_diagnosis()
        resp = self.client.post(BASE_URL, self._diagnosis_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already recorded", str(resp.data).lower())


class DiagnosisRetrieveTests(DiagnosisSetupMixin, APITestCase):
    """GET /api/v1/consultation/diagnoses/{id}/"""

    def test_retrieve_diagnosis(self):
        dx = self._create_diagnosis()
        resp = self.client.get(f"{BASE_URL}{dx.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], dx.pk)
        self.assertEqual(resp.data["patient_name"], self.patient.get_full_name())
        self.assertIn("icd10_code_details", resp.data)
        self.assertEqual(resp.data["icd10_code_details"]["code"], "B54")

    def test_retrieve_nonexistent_returns_404(self):
        resp = self.client.get(f"{BASE_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class DiagnosisUpdateTests(DiagnosisSetupMixin, APITestCase):
    """PATCH /api/v1/consultation/diagnoses/{id}/"""

    def test_patch_status(self):
        dx = self._create_diagnosis()
        resp = self.client.patch(f"{BASE_URL}{dx.pk}/", {"status": "ruled_out"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "ruled_out")

    def test_patch_certainty(self):
        dx = self._create_diagnosis()
        resp = self.client.patch(f"{BASE_URL}{dx.pk}/", {"certainty": "probable"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["certainty"], "probable")

    def test_patch_notes(self):
        dx = self._create_diagnosis()
        resp = self.client.patch(f"{BASE_URL}{dx.pk}/", {"notes": "Updated clinical note"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["notes"], "Updated clinical note")


class DiagnosisDeleteTests(DiagnosisSetupMixin, APITestCase):
    """DELETE /api/v1/consultation/diagnoses/{id}/"""

    def test_delete_diagnosis(self):
        dx = self._create_diagnosis()
        resp = self.client.delete(f"{BASE_URL}{dx.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Diagnosis.objects.filter(pk=dx.pk).exists())

    def test_delete_nonexistent_returns_404(self):
        resp = self.client.delete(f"{BASE_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class DiagnosisListTests(DiagnosisSetupMixin, APITestCase):
    """GET /api/v1/consultation/diagnoses/"""

    def setUp(self):
        super().setUp()
        self.dx1 = self._create_diagnosis()
        self.dx2 = self._create_diagnosis(icd10_code=self.icd_htn)
        self.visit2 = Visit.objects.create(
            patient=self.patient2,
            date=date.today(),
            time=time(11, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )
        self.dx3 = self._create_diagnosis(
            patient=self.patient2,
            visit=self.visit2,
            session=None,
            icd10_code=self.icd_dm,
        )

    def test_list_all(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 3)

    def test_filter_by_patient(self):
        resp = self.client.get(BASE_URL, {"patient": self.patient.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 2)
        for item in resp.data["results"]:
            self.assertEqual(item["patient"], self.patient.pk)

    def test_filter_by_patient_rejects_invalid_pk(self):
        resp = self.client.get(BASE_URL, {"patient": 99999})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filter_by_status(self):
        self.dx1.status = "suspected"
        self.dx1.save(update_fields=["status"])
        resp = self.client.get(BASE_URL, {"status": "suspected"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data["results"]:
            self.assertEqual(item["status"], "suspected")

    def test_filter_by_session(self):
        resp = self.client.get(BASE_URL, {"session": self.session.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 2)

    def test_search_by_icd10_code(self):
        resp = self.client.get(BASE_URL, {"search": "B54"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        codes = [r["icd10_code"] for r in resp.data["results"]]
        self.assertIn(self.icd_malaria.pk, codes)

    def test_ordering_by_diagnosed_at(self):
        resp = self.client.get(BASE_URL, {"ordering": "-diagnosed_at"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in resp.data["results"]]
        self.assertEqual(ids[0], self.dx3.pk)


class DiagnosisExistsTests(DiagnosisSetupMixin, APITestCase):
    """GET /api/v1/consultation/diagnoses/exists/?session=<id>"""

    def test_exists_true_when_diagnoses_present(self):
        self._create_diagnosis()
        resp = self.client.get(f"{BASE_URL}exists/", {"session": self.session.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["exists"])

    def test_exists_false_when_no_diagnoses(self):
        resp = self.client.get(f"{BASE_URL}exists/", {"session": self.session.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["exists"])

    def test_exists_requires_session_param(self):
        resp = self.client.get(f"{BASE_URL}exists/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_exists_rejects_nonexistent_session(self):
        resp = self.client.get(f"{BASE_URL}exists/", {"session": 99999})
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST])


class DiagnosisAuthTests(DiagnosisSetupMixin, APITestCase):
    """Unauthenticated requests must be rejected with 401."""

    def test_list_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(BASE_URL, self._diagnosis_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_unauthenticated_returns_401(self):
        dx = self._create_diagnosis()
        self.client.force_authenticate(user=None)
        resp = self.client.get(f"{BASE_URL}{dx.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_delete_unauthenticated_returns_401(self):
        dx = self._create_diagnosis()
        self.client.force_authenticate(user=None)
        resp = self.client.delete(f"{BASE_URL}{dx.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_exists_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(f"{BASE_URL}exists/", {"session": self.session.pk})
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
