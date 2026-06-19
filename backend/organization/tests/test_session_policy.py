"""
Tests for org-wide idle session policy and security settings API.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from organization.models import SystemConfig
from organization.session_policy import (
    SECURITY_IDLE_SESSION_TIMEOUT_KEY,
    clamp_idle_session_timeout_minutes,
    get_idle_session_timeout_minutes,
    set_idle_session_timeout_minutes,
    user_idle_session_expired,
)
from common.tests.support import create_test_user


class SessionPolicyTest(APITestCase):
    def test_clamp_idle_timeout(self):
        self.assertEqual(clamp_idle_session_timeout_minutes(30), 30)
        self.assertEqual(clamp_idle_session_timeout_minutes(2), 5)
        self.assertEqual(clamp_idle_session_timeout_minutes(999), 240)

    def test_get_and_set_idle_timeout(self):
        set_idle_session_timeout_minutes(45)
        self.assertEqual(get_idle_session_timeout_minutes(), 45)

    def test_user_idle_session_expired(self):
        user = User.objects.create_user(username="idle_user", password="pass")
        user.last_activity = timezone.now() - timedelta(minutes=31)
        user.save(update_fields=["last_activity"])
        set_idle_session_timeout_minutes(30)
        self.assertTrue(user_idle_session_expired(user))

        user.last_activity = timezone.now() - timedelta(minutes=10)
        user.save(update_fields=["last_activity"])
        self.assertFalse(user_idle_session_expired(user))


class SecuritySettingsAPITest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("sec_admin", superuser=True)
        cls.reader = create_test_user("sec_reader", pages=["/nursing"])
        SystemConfig.objects.filter(key=SECURITY_IDLE_SESSION_TIMEOUT_KEY).delete()
        set_idle_session_timeout_minutes(30)

    def test_authenticated_user_can_read_security_settings(self):
        self.client.force_authenticate(user=self.reader)
        resp = self.client.get("/api/v1/organization/security-settings/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["idle_session_timeout_minutes"], 30)

    def test_admin_can_update_security_settings(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(
            "/api/v1/organization/security-settings/",
            {"idle_session_timeout_minutes": 20},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["idle_session_timeout_minutes"], 20)
        self.assertEqual(get_idle_session_timeout_minutes(), 20)

    def test_non_admin_cannot_update_security_settings(self):
        self.client.force_authenticate(user=self.reader)
        resp = self.client.patch(
            "/api/v1/organization/security-settings/",
            {"idle_session_timeout_minutes": 15},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class IdleSessionAuthTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("idle_auth", pages=["/nursing"])
        set_idle_session_timeout_minutes(30)

    def setUp(self):
        self.user.last_activity = timezone.now() - timedelta(minutes=45)
        self.user.save(update_fields=["last_activity"])
        self.client.force_authenticate(user=None)

    def test_api_rejects_idle_user(self):
        token = str(RefreshToken.for_user(self.user).access_token)
        resp = self.client.get(
            "/api/v1/organization/security-settings/",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
        body = resp.data
        code = body.get("code")
        if code is None and isinstance(body.get("detail"), dict):
            code = body["detail"].get("code")
        self.assertEqual(code, "idle_timeout")
