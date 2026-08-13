"""Search filtering for ICD-10 disease pattern reports (?search=)."""
from datetime import date, time

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from consultation.models import ConsultationRoom, ConsultationSession, Diagnosis, ICD10Code
from patients.models import Patient, Visit

User = get_user_model()

DISEASE_PATTERN_URL = "/api/v1/reports/disease-pattern/"
DISEASE_PATTERN_COMPARED_URL = "/api/v1/reports/disease-pattern-compared/"
TOP_DIAGNOSES_URL = "/api/v1/reports/top-diagnoses/"


class DiseasePatternSearchMixin:
    """Shared fixtures: two completed consultations with distinct ICD-10 codes."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="search_dr",
            password="testpass123",
            email="search_dr@test.local",
        )

        cls.patient = Patient.objects.create(
            patient_id="SP-PT-001",
            surname="Doe",
            first_name="Jane",
            gender="female",
            date_of_birth=date(1990, 3, 15),
        )
        cls.visit = Visit.objects.create(
            patient=cls.patient,
            date=date.today(),
            time=time(10, 0),
            status="completed",
            visit_type="consultation",
            clinic="GOPD",
        )
        cls.room = ConsultationRoom.objects.create(
            name="Search Room 1",
            room_number="SP-R1",
        )
        cls.session = ConsultationSession.objects.create(
            room=cls.room,
            patient=cls.patient,
            doctor=cls.user,
            visit=cls.visit,
            status="completed",
        )

        cls.icd_malaria = ICD10Code.objects.create(
            code="B54",
            description="Unspecified malaria",
            category="Infectious diseases",
            is_active=True,
        )
        cls.icd_htn = ICD10Code.objects.create(
            code="I10",
            description="Essential hypertension",
            category="Circulatory system",
            is_active=True,
        )

        Diagnosis.objects.create(
            patient=cls.patient,
            visit=cls.visit,
            session=cls.session,
            icd10_code=cls.icd_malaria,
            status="confirmed",
            certainty="confirmed",
            diagnosed_by=cls.user,
        )
        Diagnosis.objects.create(
            patient=cls.patient,
            visit=cls.visit,
            session=cls.session,
            icd10_code=cls.icd_htn,
            status="confirmed",
            certainty="confirmed",
            diagnosed_by=cls.user,
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)


class DiseasePatternSearchTests(DiseasePatternSearchMixin, APITestCase):
    """?search= filters /reports/disease-pattern/ by code or description."""

    def _rows(self, search):
        url = f"{DISEASE_PATTERN_URL}?period=all"
        if search:
            url += f"&search={search}"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return resp.data.get("data") or [], resp.data.get("summary") or {}

    def test_no_search_returns_all_codes(self):
        rows, summary = self._rows("")
        self.assertEqual(len(rows), 2)
        self.assertEqual(summary["distinct_icd10_codes"], 2)

    def test_search_by_description(self):
        rows, summary = self._rows("malaria")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["code"], "B54")
        self.assertEqual(summary["distinct_icd10_codes"], 1)
        self.assertEqual(summary["grand_total"], 1)

    def test_search_by_code(self):
        rows, _ = self._rows("B54")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["code"], "B54")

    def test_search_case_insensitive(self):
        rows, _ = self._rows("HYPERTENSION")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["code"], "I10")

    def test_search_no_match_returns_empty(self):
        rows, summary = self._rows("zzzz")
        self.assertEqual(rows, [])
        self.assertEqual(summary["grand_total"], 0)

    def test_blank_search_ignored(self):
        rows, _ = self._rows("   ")
        self.assertEqual(len(rows), 2)


class TopDiagnosesSearchTests(DiseasePatternSearchMixin, APITestCase):
    """?search= filters /reports/top-diagnoses/."""

    def test_search_by_description(self):
        resp = self.client.get(f"{TOP_DIAGNOSES_URL}?period=all&search=hypertension")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = resp.data.get("data") or []
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["code"], "I10")

    def test_search_by_code(self):
        resp = self.client.get(f"{TOP_DIAGNOSES_URL}?period=all&search=B54")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = resp.data.get("data") or []
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["code"], "B54")

    def test_search_no_match_returns_empty(self):
        resp = self.client.get(f"{TOP_DIAGNOSES_URL}?period=all&search=zzzz")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get("data") or [], [])


class DiseasePatternComparedSearchTests(DiseasePatternSearchMixin, APITestCase):
    """?search= filters /reports/disease-pattern-compared/."""

    def test_search_filters_compared_rows(self):
        resp = self.client.get(f"{DISEASE_PATTERN_COMPARED_URL}?period=all&search=malaria")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = resp.data.get("data") or []
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["code"], "B54")
        labels = resp.data.get("period_labels") or []
        self.assertEqual(len(labels), 3)

    def test_search_no_match_returns_empty(self):
        resp = self.client.get(f"{DISEASE_PATTERN_COMPARED_URL}?period=all&search=zzzz")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data.get("data") or [], [])
