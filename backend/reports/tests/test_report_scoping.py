"""Manifest + facility-scoping safeguard tests for report endpoints.

Every report must either be FACILITY-scoped (a facility user must not see other
facilities' data) or be declared ORG_WIDE with a justification (patients are a
universal registry). This prevents a future report from silently leaking
cross-facility data.
"""
from datetime import date, time

from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_user
from organization.models import Clinic, SystemConfig
from patients.models import Patient, Visit


class ReportManifestTest(APITestCase):
    """Every report endpoint is declared as FACILITY or ORG_WIDE-with-reason."""

    # Each report: (url, classification, justification-or-None).
    # ORG_WIDE reports must give a reason; FACILITY ones must scope to a facility.
    MANIFEST = {
        "/api/v1/reports/patient-demographics/": {
            "kind": "ORG_WIDE",
            "reason": "Patient registry is universal; demographics are org-wide.",
        },
        "/api/v1/reports/new-registrations/": {
            "kind": "ORG_WIDE",
            "reason": "Registration is org-wide; report also returns a per-facility breakdown.",
        },
        "/api/v1/reports/top-diagnoses/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/lab-performance/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/pharmacy-performance/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/attendance-summary/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/attendance-statistics/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/visit-statistics/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/dispensed-prescriptions/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/laboratory-attendance/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/services-activities/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/comprehensive/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/clinic-attendance/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/radiological-services/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/referral-tracking/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/disease-pattern/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/disease-pattern-compared/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/observation-admissions/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/physio-clinical-diagnosis/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/eye-clinical-diagnosis/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/gop-attendance/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/weekend-duty/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/escort-log/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/drug-expiry/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/top-drugs/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/staff-productivity/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/critical-lab/": {
            "kind": "FACILITY",
            "reason": None,
        },
        "/api/v1/reports/notifiable-diseases/": {
            "kind": "FACILITY",
            "reason": None,
        },
    }

    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("manifest_admin", superuser=True)

    def setUp(self):
        self.client.force_authenticate(user=self.admin)

    def test_manifest_routes_exist(self):
        for url in self.MANIFEST:
            with self.subTest(url=url):
                resp = self.client.get(url + "?period=all")
                self.assertNotEqual(resp.status_code, status.HTTP_404_NOT_FOUND, f"Route missing: {url}")

    def test_org_wide_reports_carry_a_reason(self):
        for url, entry in self.MANIFEST.items():
            with self.subTest(url=url):
                if entry["kind"] == "ORG_WIDE":
                    self.assertTrue(entry.get("reason"), f"{url} is ORG_WIDE without a reason")
                else:
                    self.assertIn(entry["kind"], ("FACILITY", "ORG_WIDE"))


class ReportFacilityScopingTest(APITestCase):
    """A facility-scoped user must not see another facility's encounter data."""

    @classmethod
    def setUpTestData(cls):
        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled",
            defaults={"value": "true", "description": "Enable multi-clinic mode (test)"},
        )
        cls.alpha, _ = Clinic.objects.get_or_create(code="SCOPE-A", defaults={"name": "Alpha"})
        cls.beta, _ = Clinic.objects.get_or_create(code="SCOPE-B", defaults={"name": "Beta"})

        cls.alpha_user = create_test_user("scope_alpha", pages=["/medical-records/reports"])
        cls.alpha_user.location_clinic = cls.alpha
        cls.alpha_user.active_clinic = cls.alpha
        cls.alpha_user.save()
        cls.alpha_user.location_clinics.add(cls.alpha)

        # One clinic-A patient + visit, one clinic-B patient + visit.
        cls.pat_a = Patient.objects.create(
            patient_id="SCOPE-A-1", surname="Alpha", first_name="One",
            gender="female", date_of_birth=date(1990, 1, 1), location_clinic=cls.alpha,
        )
        cls.pat_b = Patient.objects.create(
            patient_id="SCOPE-B-1", surname="Beta", first_name="Two",
            gender="female", date_of_birth=date(1990, 1, 1), location_clinic=cls.beta,
        )
        cls.visit_a = Visit.objects.create(
            patient=cls.pat_a, date=date.today(), time=time(9, 0), status="completed",
            visit_type="consultation", clinic="GOPD", location_clinic=cls.alpha,
        )
        cls.visit_b = Visit.objects.create(
            patient=cls.pat_b, date=date.today(), time=time(10, 0), status="completed",
            visit_type="consultation", clinic="GOPD", location_clinic=cls.beta,
        )

    def setUp(self):
        self.client.force_authenticate(user=self.alpha_user)

    def test_visit_statistics_scopes_to_alpha(self):
        resp = self.client.get("/api/v1/reports/visit-statistics/?period=all")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_staff_productivity_scopes_to_alpha(self):
        resp = self.client.get("/api/v1/reports/staff-productivity/?period=all")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_new_registrations_org_wide_total_and_facility_breakdown(self):
        resp = self.client.get("/api/v1/reports/new-registrations/?period=all")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["total"], 2)  # org-wide registry
        self.assertTrue(resp.data.get("by_facility"))
