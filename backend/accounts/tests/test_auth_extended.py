"""Extended auth tests — me endpoint, logout/blacklist, change-password."""
from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user


class AuthMeEndpointTest(APITestCase):
    """GET/PATCH /api/v1/accounts/auth/me/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("me_user", pages=["/dashboard"])

    def test_me_returns_current_user(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/v1/accounts/auth/me/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["username"], "me_user")

    def test_me_unauthenticated_returns_401(self):
        resp = self.client.get("/api/v1/accounts/auth/me/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_update_me_first_name(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.patch("/api/v1/accounts/auth/me/", {"first_name": "Updated"}, format="json")
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT])


@override_settings(
    REST_FRAMEWORK={
        **{
            "DEFAULT_AUTHENTICATION_CLASSES": ["accounts.authentication.JWTAuthenticationWithActivity"],
            "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated", "permissions.api_access.ApiPageAccessPermission"],
            "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPageNumberPagination",
            "PAGE_SIZE": 25,
        },
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    }
)
class AuthLogoutBlacklistTest(APITestCase):
    """POST /api/v1/accounts/auth/token/blacklist/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("logout_user", pages=["/dashboard"])

    def test_blacklist_invalidates_refresh(self):
        login = self.client.post("/api/v1/accounts/auth/token/", {
            "username": "logout_user",
            "password": "testpass123",
        })
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        refresh = login.data["refresh"]

        blacklist = self.client.post("/api/v1/accounts/auth/token/blacklist/", {"refresh": refresh})
        self.assertEqual(blacklist.status_code, status.HTTP_200_OK)

        retry_refresh = self.client.post("/api/v1/accounts/auth/token/refresh/", {"refresh": refresh})
        self.assertEqual(retry_refresh.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_blacklist_invalid_token_rejected(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/v1/accounts/auth/token/blacklist/", {"refresh": "bogus-token"})
        self.assertIn(resp.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_401_UNAUTHORIZED])


@override_settings(
    REST_FRAMEWORK={
        **{
            "DEFAULT_AUTHENTICATION_CLASSES": ["accounts.authentication.JWTAuthenticationWithActivity"],
            "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated", "permissions.api_access.ApiPageAccessPermission"],
            "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPageNumberPagination",
            "PAGE_SIZE": 25,
        },
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    }
)
class AuthChangePasswordTest(APITestCase):
    """POST /api/v1/accounts/auth/change-password/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("chpwd_user", pages=["/dashboard"])

    def test_change_password_success(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/v1/accounts/auth/change-password/", {
            "old_password": "testpass123",
            "new_password": "NewSecure456!",
            "new_password_confirm": "NewSecure456!",
        }, format="json")
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT])

    def test_change_password_wrong_old(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/v1/accounts/auth/change-password/", {
            "old_password": "wrongpass",
            "new_password": "NewSecure456!",
            "new_password_confirm": "NewSecure456!",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_mismatch(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/v1/accounts/auth/change-password/", {
            "old_password": "testpass123",
            "new_password": "NewSecure456!",
            "new_password_confirm": "Different789!",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
