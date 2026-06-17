"""Analytics dashboard endpoint tests."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user


class AnalyticsDashboardTest(APITestCase):
    """GET /api/v1/analytics/dashboard/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("analytics_user", superuser=True)

    def test_all_time_returns_200(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/v1/analytics/dashboard/?period=all")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_date_range_returns_200(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/v1/analytics/dashboard/?start=2024-01-01&end=2024-12-31")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_unauthenticated_returns_401(self):
        resp = self.client.get("/api/v1/analytics/dashboard/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
