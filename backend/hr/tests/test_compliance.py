"""HR compliance and exemption API tests."""
from datetime import date

from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user, create_test_patient_visit
from hr.compliance import paginate_compliance, summarize_compliance_rows
from patients.models import Patient


class HRComplianceLogicTest(APITestCase):
    """Unit tests for compliance summary helpers."""

    def test_summarize_filtered_rows_matches_subset(self):
        rows = [
            {"compliance_status": "completed"},
            {"compliance_status": "completed"},
            {"compliance_status": "overdue"},
        ]
        summary = summarize_compliance_rows(rows)
        self.assertEqual(summary["total_eligible"], 3)
        self.assertEqual(summary["completed"], 2)
        self.assertEqual(summary["overdue"], 1)
        self.assertEqual(summary["due"], 0)


class HRComplianceListTest(APITestCase):
    """GET /api/v1/hr/compliance/"""

    @classmethod
    def setUpTestData(cls):
        cls.hr_user = create_test_user(
            "hr_officer",
            pages=["/hr", "/hr/annual-checkups"],
            system_role="Human Resources",
        )
        cls.non_hr = create_test_user("non_hr", pages=["/nursing"])
        cls.employee = Patient.objects.create(
            patient_id="HR-EMP-01",
            surname="Employee",
            first_name="One",
            gender="male",
            date_of_birth=date(1985, 1, 1),
            category="employee",
            is_active=True,
        )
        cls.employee_two = Patient.objects.create(
            patient_id="HR-EMP-02",
            surname="Employee",
            first_name="Two",
            gender="female",
            date_of_birth=date(1988, 3, 3),
            category="employee",
            is_active=True,
        )

    def test_hr_user_can_list(self):
        self.client.force_authenticate(user=self.hr_user)
        resp = self.client.get("/api/v1/hr/compliance/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_non_hr_user_forbidden(self):
        self.client.force_authenticate(user=self.non_hr)
        resp = self.client.get("/api/v1/hr/compliance/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_summary_endpoint(self):
        self.client.force_authenticate(user=self.hr_user)
        resp = self.client.get("/api/v1/hr/compliance/summary/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_list_summary_reflects_status_filter(self):
        self.client.force_authenticate(user=self.hr_user)
        resp = self.client.get("/api/v1/hr/compliance/?status=completed")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        summary = resp.data["summary"]
        self.assertEqual(summary["total_eligible"], resp.data["count"])
        for row in resp.data["results"]:
            self.assertEqual(row["compliance_status"], "completed")

    def test_list_pagination_returns_page_slice(self):
        self.client.force_authenticate(user=self.hr_user)
        resp = self.client.get("/api/v1/hr/compliance/?page=1&page_size=1")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["page"], 1)
        self.assertEqual(resp.data["page_size"], 1)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertGreaterEqual(resp.data["count"], 2)
        self.assertEqual(resp.data["summary"]["total_eligible"], resp.data["count"])

    def test_paginate_compliance_builds_summary_in_one_pass(self):
        rows, summary, count = paginate_compliance(
            date.today().year,
            page=1,
            page_size=1,
        )
        self.assertEqual(len(rows), 1)
        self.assertGreaterEqual(count, 2)
        self.assertEqual(summary["total_eligible"], count)


class HRExemptionTest(APITestCase):
    """CRUD /api/v1/hr/exemptions/"""

    @classmethod
    def setUpTestData(cls):
        cls.hr_user = create_test_user(
            "hr_exempt",
            pages=["/hr/exemptions"],
            system_role="Human Resources",
        )
        cls.compliance_only = create_test_user(
            "hr_compliance_only",
            pages=["/hr", "/hr/annual-checkups"],
            system_role="Human Resources",
        )
        cls.patient, _ = create_test_patient_visit(patient_id="HR-PT-01")

    def setUp(self):
        self.client.force_authenticate(user=self.hr_user)

    def test_create_exemption(self):
        resp = self.client.post("/api/v1/hr/exemptions/", {
            "patient": self.patient.pk,
            "programme_year": 2026,
            "reason": "medical",
            "notes": "Currently on extended leave",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_list_exemptions(self):
        resp = self.client.get("/api/v1/hr/exemptions/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_compliance_only_user_cannot_create_exemption(self):
        self.client.force_authenticate(user=self.compliance_only)
        resp = self.client.post("/api/v1/hr/exemptions/", {
            "patient": self.patient.pk,
            "programme_year": 2026,
            "reason": "medical",
            "notes": "Should be denied",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_compliance_only_user_cannot_list_exemptions(self):
        self.client.force_authenticate(user=self.compliance_only)
        resp = self.client.get("/api/v1/hr/exemptions/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
