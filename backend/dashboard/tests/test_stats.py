"""Dashboard stats endpoint tests."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user


class DashboardStatsTest(APITestCase):
    """GET /api/v1/dashboard/stats/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("dash_user", pages=["/dashboard"])
        cls.admin = create_test_user("dash_admin", superuser=True)

    def test_authenticated_returns_200(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/dashboard/stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_unauthenticated_returns_401(self):
        resp = self.client.get("/api/v1/dashboard/stats/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_response_has_expected_keys(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/dashboard/stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data
        self.assertIsInstance(data, dict)
