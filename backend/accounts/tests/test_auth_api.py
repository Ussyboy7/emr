"""Comprehensive API tests for the Accounts/Auth module.

Covers: JWT login (username & email), token refresh, token blacklist (logout),
current-user profile (GET/PATCH /me/), password change, and edge cases around
inactive users, missing fields, and invalid tokens.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_user, grant_pages

User = get_user_model()

TOKEN_URL = "/api/v1/accounts/auth/token/"
REFRESH_URL = "/api/v1/accounts/auth/token/refresh/"
BLACKLIST_URL = "/api/v1/accounts/auth/token/blacklist/"
ME_URL = "/api/v1/accounts/auth/me/"
CHANGE_PASSWORD_URL = "/api/v1/accounts/auth/change-password/"

_NO_THROTTLE = {
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {},
}


def _drf_settings(**extra):
    base = {
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ],
        "DEFAULT_PERMISSION_CLASSES": [
            "rest_framework.permissions.IsAuthenticated",
        ],
        **_NO_THROTTLE,
    }
    base.update(extra)
    return base


# ---------------------------------------------------------------------------
# Login / Token-obtain tests
# ---------------------------------------------------------------------------
@override_settings(REST_FRAMEWORK=_drf_settings())
class LoginTests(APITestCase):
    """POST /api/v1/accounts/auth/token/"""

    PASSWORD = "CorrectPass123!"

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="login_user",
            password=cls.PASSWORD,
            email="login_user@test.local",
            first_name="Login",
            last_name="User",
        )

    def setUp(self):
        cache.clear()

    def test_login_with_valid_username_returns_tokens(self):
        resp = self.client.post(
            TOKEN_URL,
            {"username": "login_user", "password": self.PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)

    def test_login_with_valid_email_returns_tokens(self):
        resp = self.client.post(
            TOKEN_URL,
            {"username": "login_user@test.local", "password": self.PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)

    def test_login_email_is_case_insensitive(self):
        resp = self.client.post(
            TOKEN_URL,
            {"username": "LOGIN_USER@TEST.LOCAL", "password": self.PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)

    def test_login_wrong_password_returns_401(self):
        resp = self.client.post(
            TOKEN_URL,
            {"username": "login_user", "password": "WrongPassword!"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_wrong_password_still_returns_401_when_audit_logging_fails(self):
        with patch(
            "accounts.auth_views.AuditService.log_activity",
            side_effect=RuntimeError("audit unavailable"),
        ):
            resp = self.client.post(
                TOKEN_URL,
                {"username": "login_user", "password": "WrongPassword!"},
                format="json",
            )

        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_nonexistent_user_returns_401(self):
        resp = self.client.post(
            TOKEN_URL,
            {"username": "nobody", "password": "whatever"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_missing_password_returns_400(self):
        resp = self.client.post(
            TOKEN_URL,
            {"username": "login_user"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_missing_password_still_returns_400_when_audit_logging_fails(self):
        with patch(
            "accounts.auth_views.AuditService.log_activity",
            side_effect=RuntimeError("audit unavailable"),
        ):
            resp = self.client.post(
                TOKEN_URL,
                {"username": "login_user"},
                format="json",
            )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_missing_username_returns_400(self):
        resp = self.client.post(
            TOKEN_URL,
            {"password": self.PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_empty_body_returns_400(self):
        resp = self.client.post(TOKEN_URL, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_inactive_user_returns_401(self):
        inactive = User.objects.create_user(
            username="inactive_user",
            password=self.PASSWORD,
            email="inactive@test.local",
            is_active=False,
        )
        resp = self.client.post(
            TOKEN_URL,
            {"username": "inactive_user", "password": self.PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_updates_last_login_timestamp(self):
        self.user.last_login = None
        self.user.save(update_fields=["last_login"])

        self.client.post(
            TOKEN_URL,
            {"username": "login_user", "password": self.PASSWORD},
            format="json",
        )
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

    def test_login_updates_last_activity(self):
        self.user.last_activity = None
        self.user.save(update_fields=["last_activity"])

        self.client.post(
            TOKEN_URL,
            {"username": "login_user", "password": self.PASSWORD},
            format="json",
        )
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_activity)


# ---------------------------------------------------------------------------
# Token refresh tests
# ---------------------------------------------------------------------------
@override_settings(REST_FRAMEWORK=_drf_settings())
class TokenRefreshTests(APITestCase):
    """POST /api/v1/accounts/auth/token/refresh/"""

    PASSWORD = "CorrectPass123!"

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="refresh_user",
            password=cls.PASSWORD,
            email="refresh@test.local",
        )

    def setUp(self):
        cache.clear()

    def _get_refresh_token(self):
        resp = self.client.post(
            TOKEN_URL,
            {"username": "refresh_user", "password": self.PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return resp.data["refresh"]

    def test_refresh_with_valid_token_returns_new_access(self):
        refresh = self._get_refresh_token()
        resp = self.client.post(
            REFRESH_URL,
            {"refresh": refresh},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)

    def test_refresh_with_invalid_token_returns_401(self):
        resp = self.client.post(
            REFRESH_URL,
            {"refresh": "not-a-real-jwt-token"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_with_empty_token_returns_400(self):
        resp = self.client.post(
            REFRESH_URL,
            {"refresh": ""},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_refresh_missing_field_returns_400(self):
        resp = self.client.post(REFRESH_URL, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_refresh_after_blacklist_returns_401(self):
        """Once a refresh token is blacklisted it cannot be reused."""
        refresh = self._get_refresh_token()
        blacklist_resp = self.client.post(
            BLACKLIST_URL,
            {"refresh": refresh},
            format="json",
        )
        self.assertEqual(blacklist_resp.status_code, status.HTTP_200_OK)

        resp = self.client.post(
            REFRESH_URL,
            {"refresh": refresh},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Logout / token blacklist tests
# ---------------------------------------------------------------------------
@override_settings(REST_FRAMEWORK=_drf_settings())
class LogoutBlacklistTests(APITestCase):
    """POST /api/v1/accounts/auth/token/blacklist/"""

    PASSWORD = "CorrectPass123!"

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="logout_user",
            password=cls.PASSWORD,
            email="logout@test.local",
        )

    def setUp(self):
        cache.clear()

    def _login(self):
        resp = self.client.post(
            TOKEN_URL,
            {"username": "logout_user", "password": self.PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return resp.data

    def test_blacklist_valid_refresh_returns_200(self):
        tokens = self._login()
        resp = self.client.post(
            BLACKLIST_URL,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_blacklist_prevents_token_reuse(self):
        tokens = self._login()
        self.client.post(BLACKLIST_URL, {"refresh": tokens["refresh"]}, format="json")

        resp = self.client.post(
            REFRESH_URL,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_blacklist_invalid_token_rejected(self):
        resp = self.client.post(
            BLACKLIST_URL,
            {"refresh": "bogus-token"},
            format="json",
        )
        self.assertIn(
            resp.status_code,
            [status.HTTP_400_BAD_REQUEST, status.HTTP_401_UNAUTHORIZED],
        )

    def test_blacklist_missing_refresh_returns_400(self):
        resp = self.client.post(BLACKLIST_URL, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Current user profile (GET / PATCH /me/)
# ---------------------------------------------------------------------------
@override_settings(REST_FRAMEWORK=_drf_settings())
class MeEndpointTests(APITestCase):
    """GET/PATCH /api/v1/accounts/auth/me/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("me_tester", pages=["/dashboard"])

    def test_get_me_authenticated_returns_200(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get(ME_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["username"], "me_tester")
        self.assertIn("id", resp.data)
        self.assertIn("email", resp.data)

    def test_get_me_returns_permissions_block(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get(ME_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("permissions", resp.data)
        self.assertIn("pages", resp.data["permissions"])
        self.assertIn("actions", resp.data["permissions"])

    def test_get_me_unauthenticated_returns_401(self):
        resp = self.client.get(ME_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_patch_me_updates_first_name(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.patch(
            ME_URL,
            {"first_name": "Updated"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["first_name"], "Updated")

    def test_patch_me_updates_phone(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.patch(
            ME_URL,
            {"phone": "+2348012345678"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["phone"], "+2348012345678")

    def test_patch_me_updates_bio(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.patch(
            ME_URL,
            {"bio": "Senior consultant physician."},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["bio"], "Senior consultant physician.")

    def test_patch_me_unauthenticated_returns_401(self):
        resp = self.client.patch(
            ME_URL,
            {"first_name": "Hacker"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_me_returns_full_name(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get(ME_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("full_name", resp.data)

    def test_get_me_superuser_flag(self):
        admin = create_test_user("me_admin", superuser=True)
        self.client.force_authenticate(user=admin)
        resp = self.client.get(ME_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["is_superuser"])


# ---------------------------------------------------------------------------
# Password change tests
# ---------------------------------------------------------------------------
@override_settings(REST_FRAMEWORK=_drf_settings())
class ChangePasswordTests(APITestCase):
    """POST /api/v1/accounts/auth/change-password/"""

    OLD_PASSWORD = "OldSecure123!"

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="pwd_changer",
            password=self.OLD_PASSWORD,
            email="pwd@test.local",
            first_name="Pwd",
            last_name="Changer",
        )
        grant_pages(self.user, ["/dashboard"])
        self.client.force_authenticate(user=self.user)

    def test_change_password_success(self):
        resp = self.client.post(
            CHANGE_PASSWORD_URL,
            {
                "old_password": self.OLD_PASSWORD,
                "new_password": "NewSecure456!",
                "new_password_confirm": "NewSecure456!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewSecure456!"))

    def test_change_password_wrong_old_returns_400(self):
        resp = self.client.post(
            CHANGE_PASSWORD_URL,
            {
                "old_password": "WrongOldPass!",
                "new_password": "NewSecure456!",
                "new_password_confirm": "NewSecure456!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("old_password", resp.data)

    def test_change_password_mismatch_returns_400(self):
        resp = self.client.post(
            CHANGE_PASSWORD_URL,
            {
                "old_password": self.OLD_PASSWORD,
                "new_password": "NewSecure456!",
                "new_password_confirm": "MismatchPass789!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_missing_fields_returns_400(self):
        resp = self.client.post(
            CHANGE_PASSWORD_URL,
            {"old_password": self.OLD_PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            CHANGE_PASSWORD_URL,
            {
                "old_password": self.OLD_PASSWORD,
                "new_password": "NewSecure456!",
                "new_password_confirm": "NewSecure456!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_change_password_too_short_returns_400(self):
        resp = self.client.post(
            CHANGE_PASSWORD_URL,
            {
                "old_password": self.OLD_PASSWORD,
                "new_password": "Ab1!",
                "new_password_confirm": "Ab1!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_allows_login_with_new_password(self):
        """After a successful change the new password works for a fresh login."""
        new_pw = "BrandNew999!"
        self.client.post(
            CHANGE_PASSWORD_URL,
            {
                "old_password": self.OLD_PASSWORD,
                "new_password": new_pw,
                "new_password_confirm": new_pw,
            },
            format="json",
        )
        self.client.force_authenticate(user=None)
        login = self.client.post(
            TOKEN_URL,
            {"username": "pwd_changer", "password": new_pw},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.assertIn("access", login.data)


# ---------------------------------------------------------------------------
# JWT access-token gating tests
# ---------------------------------------------------------------------------
@override_settings(REST_FRAMEWORK=_drf_settings())
class AccessTokenGatingTests(APITestCase):
    """Verify protected endpoints reject requests with bad/missing tokens."""

    PASSWORD = "CorrectPass123!"

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="token_user",
            password=cls.PASSWORD,
            email="token@test.local",
        )
        grant_pages(cls.user, ["/dashboard"])

    def setUp(self):
        cache.clear()

    def _obtain_tokens(self):
        resp = self.client.post(
            TOKEN_URL,
            {"username": "token_user", "password": self.PASSWORD},
            format="json",
        )
        return resp.data

    def test_me_with_valid_bearer_token(self):
        tokens = self._obtain_tokens()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        resp = self.client.get(ME_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["username"], "token_user")

    def test_me_with_invalid_bearer_token_returns_401(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer invalid.jwt.token")
        resp = self.client.get(ME_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_without_auth_header_returns_401(self):
        resp = self.client.get(ME_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_change_password_with_bearer_token(self):
        tokens = self._obtain_tokens()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        resp = self.client.post(
            CHANGE_PASSWORD_URL,
            {
                "old_password": self.PASSWORD,
                "new_password": "NewToken456!",
                "new_password_confirm": "NewToken456!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
