"""API tests for ICD-10 code endpoints (list, search, resolve, stats, categories)."""
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from consultation.models import ICD10Code, Diagnosis
from patients.models import Patient

from datetime import date

User = get_user_model()

BASE_URL = "/api/v1/consultation/icd10-codes/"


class ICD10CodeSetupMixin:
    """Shared setUp for ICD-10 tests."""

    def setUp(self):
        self.user = User.objects.create_superuser(
            username="icd_user",
            password="testpass123",
            email="icd@test.local",
            first_name="ICD",
            last_name="Tester",
        )
        self.client.force_authenticate(user=self.user)

        self.codes = []
        for code, desc, cat in [
            ("A00.0", "Cholera due to Vibrio cholerae", "Infectious diseases"),
            ("A00.1", "Cholera due to Vibrio eltor", "Infectious diseases"),
            ("A01.0", "Typhoid fever", "Infectious diseases"),
            ("I10", "Essential hypertension", "Circulatory system"),
            ("I11.0", "Hypertensive heart disease with heart failure", "Circulatory system"),
            ("E11.9", "Type 2 diabetes mellitus", "Endocrine diseases"),
            ("J00", "Acute nasopharyngitis", "Respiratory system"),
            ("J06.9", "Acute upper respiratory infection", "Respiratory system"),
            ("M54.5", "Low back pain", "Musculoskeletal system"),
            ("Z00.0", "General adult medical examination", "Factors influencing health"),
        ]:
            self.codes.append(
                ICD10Code.objects.create(code=code, description=desc, category=cat, is_active=True)
            )

        self.inactive_code = ICD10Code.objects.create(
            code="X99.9", description="Inactive test code", category="Test", is_active=False
        )


class ICD10CodeListTests(ICD10CodeSetupMixin, APITestCase):
    """Tests for listing and searching ICD-10 codes."""

    def test_list_returns_active_codes_only(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        codes_returned = [r["code"] for r in resp.data["results"]]
        self.assertIn("A00.0", codes_returned)
        self.assertNotIn("X99.9", codes_returned)

    def test_list_pagination(self):
        resp = self.client.get(BASE_URL, {"page_size": 3, "page": 1})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 3)
        self.assertGreater(resp.data["count"], 3)

    def test_search_by_code(self):
        resp = self.client.get(BASE_URL, {"search": "A00"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        codes_returned = [r["code"] for r in resp.data["results"]]
        self.assertIn("A00.0", codes_returned)
        self.assertIn("A00.1", codes_returned)
        self.assertNotIn("I10", codes_returned)

    def test_search_by_description(self):
        resp = self.client.get(BASE_URL, {"search": "diabetes"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        codes_returned = [r["code"] for r in resp.data["results"]]
        self.assertIn("E11.9", codes_returned)

    def test_filter_by_category(self):
        resp = self.client.get(BASE_URL, {"category": "Circulatory system"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data["results"]:
            self.assertEqual(item["category"], "Circulatory system")

    def test_ordering_by_code(self):
        resp = self.client.get(BASE_URL, {"ordering": "code"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        codes_returned = [r["code"] for r in resp.data["results"]]
        self.assertEqual(codes_returned, sorted(codes_returned))

    def test_unauthenticated_access_denied(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class ICD10CodeResolveTests(ICD10CodeSetupMixin, APITestCase):
    """Tests for the resolve endpoint."""

    def test_resolve_exact_code(self):
        resp = self.client.get(f"{BASE_URL}resolve/", {"code": "I10"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["code"], "I10")
        self.assertEqual(resp.data["description"], "Essential hypertension")

    def test_resolve_case_insensitive(self):
        resp = self.client.get(f"{BASE_URL}resolve/", {"code": "i10"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["code"], "I10")

    def test_resolve_missing_code_param(self):
        resp = self.client.get(f"{BASE_URL}resolve/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_resolve_nonexistent_code(self):
        resp = self.client.get(f"{BASE_URL}resolve/", {"code": "ZZZ.999"})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_resolve_inactive_code_not_found(self):
        resp = self.client.get(f"{BASE_URL}resolve/", {"code": "X99.9"})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class ICD10CodeStatsTests(ICD10CodeSetupMixin, APITestCase):
    """Tests for the stats endpoint."""

    def setUp(self):
        super().setUp()
        self.patient = Patient.objects.create(
            patient_id="STATS-PT-001",
            surname="Stats",
            first_name="Patient",
            gender="female",
            date_of_birth=date(1985, 6, 15),
        )
        Diagnosis.objects.create(
            patient=self.patient,
            icd10_code=self.codes[0],
            status="confirmed",
            certainty="confirmed",
            diagnosed_by=self.user,
        )
        Diagnosis.objects.create(
            patient=self.patient,
            icd10_code=self.codes[3],
            status="confirmed",
            certainty="confirmed",
            diagnosed_by=self.user,
        )
        Diagnosis.objects.create(
            patient=self.patient,
            icd10_code=self.codes[0],
            status="suspected",
            certainty="probable",
            diagnosed_by=self.user,
        )

    def test_stats_returns_totals(self):
        resp = self.client.get(f"{BASE_URL}stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["total_codes"], 11)  # 10 active + 1 inactive
        self.assertEqual(resp.data["active_codes"], 10)
        self.assertEqual(resp.data["inactive_codes"], 1)
        self.assertEqual(resp.data["total_diagnoses"], 3)

    def test_stats_returns_categories(self):
        resp = self.client.get(f"{BASE_URL}stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        cats = resp.data["categories"]
        self.assertIsInstance(cats, list)
        self.assertGreater(len(cats), 0)
        cat_names = [c["category"] for c in cats]
        self.assertIn("Infectious diseases", cat_names)
        self.assertIn("Circulatory system", cat_names)

    def test_stats_returns_top_used_codes(self):
        resp = self.client.get(f"{BASE_URL}stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        top = resp.data["top_used_codes"]
        self.assertIsInstance(top, list)
        self.assertGreater(len(top), 0)
        self.assertEqual(top[0]["code"], "A00.0")
        self.assertEqual(top[0]["usage_count"], 2)

    def test_stats_empty_diagnoses(self):
        Diagnosis.objects.all().delete()
        resp = self.client.get(f"{BASE_URL}stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["total_diagnoses"], 0)
        self.assertEqual(resp.data["top_used_codes"], [])


class ICD10CodeCategoriesTests(ICD10CodeSetupMixin, APITestCase):
    """Tests for the categories endpoint."""

    def test_categories_returns_distinct_categories(self):
        resp = self.client.get(f"{BASE_URL}categories/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 6)
        cat_names = sorted([c["category"] for c in resp.data["results"]])
        self.assertEqual(cat_names, [
            "Circulatory system",
            "Endocrine diseases",
            "Factors influencing health",
            "Infectious diseases",
            "Musculoskeletal system",
            "Respiratory system",
        ])

    def test_categories_include_code_counts(self):
        resp = self.client.get(f"{BASE_URL}categories/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        infectious = next(
            c for c in resp.data["results"] if c["category"] == "Infectious diseases"
        )
        self.assertEqual(infectious["count"], 3)

    def test_categories_exclude_inactive(self):
        resp = self.client.get(f"{BASE_URL}categories/")
        cat_names = [c["category"] for c in resp.data["results"]]
        self.assertNotIn("Test", cat_names)
