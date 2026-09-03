"""Reports smoke tests — verify key report endpoints return 200."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user

REPORT_ENDPOINTS = [
    "/api/v1/reports/patient-demographics/",
    "/api/v1/reports/top-diagnoses/",
    "/api/v1/reports/pharmacy-performance/",
    "/api/v1/reports/attendance-summary/",
    "/api/v1/reports/observation-admissions/",
    "/api/v1/reports/physio-clinical-diagnosis/",
    "/api/v1/reports/eye-clinical-diagnosis/",
    "/api/v1/reports/visit-statistics/",
    "/api/v1/reports/dispensed-prescriptions/",
    "/api/v1/reports/comprehensive/",
    "/api/v1/reports/clinic-attendance/",
    "/api/v1/reports/radiological-services/",
    "/api/v1/reports/referral-tracking/",
    "/api/v1/reports/disease-pattern/",
    "/api/v1/reports/doctor-patient-count/",
    "/api/v1/reports/new-registrations/",
    "/api/v1/reports/drug-expiry/",
    "/api/v1/reports/top-drugs/",
    "/api/v1/reports/critical-lab/",
    "/api/v1/reports/notifiable-diseases/",
]


class ReportsSmokeTest(APITestCase):
    """All report GET endpoints should return 200 for authenticated superuser."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("report_admin", superuser=True)

    def setUp(self):
        self.client.force_authenticate(user=self.admin)

    def test_all_report_endpoints_return_200(self):
        for url in REPORT_ENDPOINTS:
            with self.subTest(url=url):
                resp = self.client.get(url + "?period=all")
                self.assertIn(
                    resp.status_code,
                    [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT],
                    f"{url} returned {resp.status_code}: {getattr(resp, 'data', '')}"
                )


class ReportsRBACTest(APITestCase):
    """Unauthenticated requests to reports get 401."""

    def test_unauthenticated_returns_401(self):
        resp = self.client.get("/api/v1/reports/patient-demographics/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
