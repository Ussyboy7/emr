"""Family grouping (?group_by=family) for ICD-10 ranking reports."""
from datetime import date, time

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from consultation.models import ConsultationRoom, ConsultationSession, Diagnosis, ICD10Code
from patients.models import Patient, Visit

User = get_user_model()

DISEASE_PATTERN_URL = "/api/v1/reports/disease-pattern/"
TOP_DIAGNOSES_URL = "/api/v1/reports/top-diagnoses/"


class Icd10FamilyGroupingTests(APITestCase):
    """Two malaria codes (B50, B54) fold into one family; I10 stays separate."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="family_dr",
            password="testpass123",
            email="family_dr@test.local",
        )

        cls.patient = Patient.objects.create(
            patient_id="FG-PT-001",
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
            name="Family Room 1",
            room_number="FG-R1",
        )
        cls.session = ConsultationSession.objects.create(
            room=cls.room,
            patient=cls.patient,
            doctor=cls.user,
            visit=cls.visit,
            status="completed",
        )

        cls.icd_b54 = ICD10Code.objects.create(
            code="B54",
            description="Unspecified malaria",
            category="Infectious diseases",
            is_active=True,
        )
        cls.icd_b50 = ICD10Code.objects.create(
            code="B50",
            description="Falciparum malaria",
            category="Infectious diseases",
            is_active=True,
        )
        cls.icd_i10 = ICD10Code.objects.create(
            code="I10",
            description="Essential hypertension",
            category="Circulatory system",
            is_active=True,
        )

        for icd in (cls.icd_b54, cls.icd_b50, cls.icd_i10):
            Diagnosis.objects.create(
                patient=cls.patient,
                visit=cls.visit,
                session=cls.session,
                icd10_code=icd,
                status="confirmed",
                certainty="confirmed",
                diagnosed_by=cls.user,
            )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_disease_pattern_grouped_by_family(self):
        resp = self.client.get(f"{DISEASE_PATTERN_URL}?period=all&group_by=family")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = resp.data.get("data") or []
        summary = resp.data.get("summary") or {}
        self.assertEqual(len(rows), 2)
        self.assertEqual(summary["group_by"], "family")
        self.assertEqual(summary["distinct_icd10_codes"], 3)
        self.assertEqual(summary["grand_total"], 3)
        self.assertEqual(summary["ranking_count"], 2)

        by_code = {row["code"]: row for row in rows}
        malaria = by_code.get("B50–B54")
        self.assertIsNotNone(malaria)
        self.assertEqual(malaria["description"], "Malaria")
        self.assertEqual(malaria["total"], 2)
        self.assertEqual(malaria["codes_count"], 2)
        self.assertEqual(set(malaria["codes"]), {"B50", "B54"})

        htn = by_code.get("I10–I15")
        self.assertIsNotNone(htn)
        self.assertEqual(htn["description"], "Hypertensive diseases")
        self.assertEqual(htn["total"], 1)
        self.assertEqual(htn["codes_count"], 1)

    def test_top_diagnoses_grouped_by_family(self):
        resp = self.client.get(f"{TOP_DIAGNOSES_URL}?period=all&group_by=family")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = resp.data.get("data") or []
        summary = resp.data.get("summary") or {}
        self.assertEqual(len(rows), 2)
        self.assertEqual(summary["group_by"], "family")
        self.assertEqual(summary["distinct_icd10_codes"], 3)

        malaria = next((r for r in rows if r["code"] == "B50–B54"), None)
        self.assertIsNotNone(malaria)
        self.assertEqual(malaria["count"], 2)
        self.assertEqual(malaria["codes_count"], 2)
        self.assertEqual(malaria["percentage"], 66.7)

    def test_grouped_families_sorted_by_count(self):
        resp = self.client.get(f"{TOP_DIAGNOSES_URL}?period=all&group_by=family")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = resp.data.get("data") or []
        counts = [row["count"] for row in rows]
        self.assertEqual(counts, sorted(counts, reverse=True))
        self.assertEqual(rows[0]["description"], "Malaria")

    def test_ungrouped_still_per_code(self):
        resp = self.client.get(f"{DISEASE_PATTERN_URL}?period=all")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = resp.data.get("data") or []
        summary = resp.data.get("summary") or {}
        self.assertEqual(len(rows), 3)
        self.assertEqual(summary["group_by"], "code")