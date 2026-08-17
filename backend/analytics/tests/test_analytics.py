"""Analytics dashboard endpoint tests."""
from django.core.cache import cache
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user


class AnalyticsDashboardTest(APITestCase):
    """GET /api/v1/analytics/dashboard/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("analytics_user", superuser=True)

    def setUp(self):
        cache.clear()

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

    def test_repeated_period_uses_cache(self):
        self.client.force_authenticate(user=self.user)
        first = self.client.get("/api/v1/analytics/dashboard/?period=all")
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        from unittest.mock import patch
        from analytics.clinical_dashboard import _build_clinical_dashboard

        with patch(
            "analytics.clinical_dashboard._build_clinical_dashboard",
            side_effect=AssertionError("builder re-ran from cache"),
        ):
            second = self.client.get("/api/v1/analytics/dashboard/?period=all")

        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data, first.data)
