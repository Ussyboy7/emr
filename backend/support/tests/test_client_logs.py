"""API tests for the ClientLogsView endpoint (POST client-side debug logs)."""
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()

BASE_URL = "/api/v1/support/client-logs/"


class ClientLogsPostTests(APITestCase):
    """Tests for submitting client-side logs via POST."""

    def test_post_info_log(self):
        resp = self.client.post(
            BASE_URL,
            {"level": "info", "message": "Page loaded", "context": {"page": "/dashboard"}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, {"status": "logged"})

    def test_post_error_log(self):
        resp = self.client.post(
            BASE_URL,
            {"level": "error", "message": "Unhandled exception", "context": {"stack": "..."}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, {"status": "logged"})

    def test_post_warn_log(self):
        resp = self.client.post(
            BASE_URL,
            {"level": "warn", "message": "Deprecation notice"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, {"status": "logged"})

    def test_post_defaults_level_to_info(self):
        resp = self.client.post(
            BASE_URL,
            {"message": "No level supplied"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, {"status": "logged"})

    def test_post_empty_body_succeeds(self):
        """An empty JSON object is accepted; level defaults to 'info', message to ''."""
        resp = self.client.post(BASE_URL, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, {"status": "logged"})

    def test_post_with_context_omitted(self):
        resp = self.client.post(
            BASE_URL,
            {"level": "error", "message": "No context field"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, {"status": "logged"})


class ClientLogsLoggerIntegrationTests(APITestCase):
    """Verify the correct Python logger methods are called per log level."""

    @patch("support.views.logger")
    def test_info_level_calls_logger_info(self, mock_logger):
        self.client.post(
            BASE_URL,
            {"level": "info", "message": "hello"},
            format="json",
        )
        mock_logger.info.assert_called_once()
        self.assertIn("CLIENT-INFO", mock_logger.info.call_args[0][0])

    @patch("support.views.logger")
    def test_error_level_calls_logger_error(self, mock_logger):
        self.client.post(
            BASE_URL,
            {"level": "error", "message": "boom"},
            format="json",
        )
        mock_logger.error.assert_called_once()
        self.assertIn("CLIENT-ERROR", mock_logger.error.call_args[0][0])

    @patch("support.views.logger")
    def test_warn_level_calls_logger_warning(self, mock_logger):
        self.client.post(
            BASE_URL,
            {"level": "warn", "message": "heads up"},
            format="json",
        )
        mock_logger.warning.assert_called_once()
        self.assertIn("CLIENT-WARN", mock_logger.warning.call_args[0][0])

    @patch("support.views.logger")
    def test_context_included_in_log_message(self, mock_logger):
        ctx = {"browser": "Chrome", "version": "126"}
        self.client.post(
            BASE_URL,
            {"level": "info", "message": "ctx test", "context": ctx},
            format="json",
        )
        log_msg = mock_logger.info.call_args[0][0]
        self.assertIn("Context:", log_msg)


class ClientLogsValidationTests(APITestCase):
    """Tests for malformed / invalid payloads."""

    def test_invalid_json_returns_error(self):
        resp = self.client.post(
            BASE_URL,
            "this is not json",
            content_type="application/json",
        )
        self.assertIn(resp.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_500_INTERNAL_SERVER_ERROR])

    def test_non_json_content_type_still_accepted(self):
        """DRF parses form-encoded data into request.data as a dict, so the
        view handles it without hitting the JSONDecodeError path."""
        resp = self.client.post(
            BASE_URL,
            {"level": "info", "message": "form post"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class ClientLogsAuthTests(APITestCase):
    """The endpoint uses AllowAny — verify both anonymous and authenticated
    requests succeed."""

    def test_unauthenticated_request_allowed(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            BASE_URL,
            {"level": "info", "message": "anon log"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_authenticated_request_allowed(self):
        user = User.objects.create_user(
            username="log_user",
            password="testpass123",
            email="log@test.local",
            first_name="Log",
            last_name="Tester",
        )
        self.client.force_authenticate(user=user)
        resp = self.client.post(
            BASE_URL,
            {"level": "info", "message": "authed log"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class ClientLogsMethodTests(APITestCase):
    """Only POST is implemented; other HTTP methods should be rejected."""

    def test_get_not_allowed(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_put_not_allowed(self):
        resp = self.client.put(BASE_URL, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_patch_not_allowed(self):
        resp = self.client.patch(BASE_URL, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_delete_not_allowed(self):
        resp = self.client.delete(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
