"""Audit activity log API tests — list, scoping, stats."""
from rest_framework.test import APITestCase
from rest_framework import status

from audit.models import ActivityLog
from common.tests.support import create_test_user


class AuditLogListTest(APITestCase):
    """GET /api/v1/audit/logs/"""

    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("audit_admin", superuser=True)
        cls.normal = create_test_user("audit_user", pages=["/admin"])
        ActivityLog.objects.create(
            user=cls.admin, action="login", module="authentication",
            description="Admin logged in", object_type="user",
        )
        ActivityLog.objects.create(
            user=cls.normal, action="view", module="patients",
            description="Viewed patient", object_type="patient",
        )

    def test_superuser_sees_all_logs(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/audit/logs/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 2)

    def test_admin_audit_page_user_sees_org_wide_logs(self):
        audit_user = create_test_user("audit_page_user", pages=["/admin/audit"])
        self.client.force_authenticate(user=audit_user)
        resp = self.client.get("/api/v1/audit/logs/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 2)

    def test_admin_dashboard_page_user_sees_org_wide_logs(self):
        admin_user = create_test_user("admin_hub_user", pages=["/admin"])
        self.client.force_authenticate(user=admin_user)
        resp = self.client.get("/api/v1/audit/logs/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 2)

    def test_normal_user_sees_own_logs_only(self):
        self.client.force_authenticate(user=self.normal)
        resp = self.client.get("/api/v1/audit/logs/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for log in resp.data.get("results", []):
            self.assertEqual(log["user"], self.normal.pk)

    def test_filter_by_module(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/audit/logs/?module=authentication")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_unauthenticated_returns_401(self):
        resp = self.client.get("/api/v1/audit/logs/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class AuditLogStatsTest(APITestCase):
    """GET /api/v1/audit/logs/stats/"""

    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("audit_stats", superuser=True)

    def test_stats_returns_200(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/audit/logs/stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class AuditLogModulesTest(APITestCase):
    """GET /api/v1/audit/logs/modules/"""

    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("audit_modules", superuser=True)

    def test_modules_returns_200(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/audit/logs/modules/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
