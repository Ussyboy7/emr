"""Support ticket API tests."""
from unittest.mock import patch

from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from rest_framework.throttling import ScopedRateThrottle
from common.tests.support import create_test_user


class SupportTicketTest(APITestCase):
    """Support ticket lifecycle API."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("help_user", pages=["/nursing"])
        cls.other_user = create_test_user("other_user", pages=["/laboratory"])
        cls.it_user = create_test_user("it_user", pages=["/admin/support-tickets"])
        cls.no_role = create_test_user("no_pages", pages=[])

    @patch("support.views.EmailService.send_email", return_value=True)
    def test_authenticated_user_can_submit_ticket(self, mock_send_email):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            "/api/v1/support/tickets/",
            {
                "category": "technical",
                "priority": "high",
                "subject": "Cannot print lab report",
                "description": "Print dialog opens but nothing prints.",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["reference"].startswith("EMR-"))
        self.assertEqual(resp.data["status"], "open")
        mock_send_email.assert_called_once()

        log = ActivityLog.objects.get(object_id=resp.data["reference"])
        self.assertEqual(log.object_type, "support_ticket")
        self.assertEqual(log.metadata["category"], "technical")
        self.assertEqual(log.metadata["status"], "open")

    @patch("support.views.EmailService.send_email", side_effect=RuntimeError("SMTP down"))
    def test_ticket_succeeds_when_email_notification_fails(self, _mock_send_email):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            "/api/v1/support/tickets/",
            {
                "category": "technical",
                "priority": "medium",
                "subject": "Test",
                "description": "Test body",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    @patch("support.views.EmailService.send_email", return_value=True)
    def test_user_can_list_own_tickets_only(self, _mock_send_email):
        self.client.force_authenticate(user=self.user)
        self.client.post(
            "/api/v1/support/tickets/",
            {
                "category": "access",
                "priority": "low",
                "subject": "Mine",
                "description": "My ticket",
            },
            format="json",
        )
        self.client.force_authenticate(user=self.other_user)
        self.client.post(
            "/api/v1/support/tickets/",
            {
                "category": "technical",
                "priority": "low",
                "subject": "Theirs",
                "description": "Other ticket",
            },
            format="json",
        )

        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/v1/support/tickets/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["subject"], "Mine")

    @patch("support.views.EmailService.send_email", return_value=True)
    def test_it_user_can_view_queue_and_update_status(self, _mock_send_email):
        self.client.force_authenticate(user=self.user)
        created = self.client.post(
            "/api/v1/support/tickets/",
            {
                "category": "technical",
                "priority": "high",
                "subject": "Queue item",
                "description": "Needs triage",
            },
            format="json",
        )
        ticket_id = created.data["id"]

        self.client.force_authenticate(user=self.it_user)
        queue = self.client.get("/api/v1/support/tickets/queue/")
        self.assertEqual(queue.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(queue.data["count"], 1)

        patch_resp = self.client.patch(
            f"/api/v1/support/tickets/{ticket_id}/",
            {"status": "in_progress"},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_resp.data["status"], "in_progress")

        log = ActivityLog.objects.get(pk=ticket_id)
        self.assertEqual(log.metadata["status"], "in_progress")

    def test_non_it_user_cannot_access_queue(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/v1/support/tickets/queue/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    @patch.object(ScopedRateThrottle, "get_rate", return_value="1/min")
    @patch("support.views.EmailService.send_email", return_value=True)
    def test_ticket_submission_is_throttled(self, _mock_send_email, _mock_rate):
        cache.clear()
        self.client.force_authenticate(user=self.user)
        payload = {
            "category": "technical",
            "priority": "low",
            "subject": "Throttle test",
            "description": "Body",
        }
        resp = self.client.post("/api/v1/support/tickets/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        resp = self.client.post("/api/v1/support/tickets/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_user_docs_list_and_detail(self):
        self.client.force_authenticate(user=self.user)
        listing = self.client.get("/api/v1/support/docs/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertTrue(any(item["slug"] == "quick-start" for item in listing.data["results"]))

        detail = self.client.get("/api/v1/support/docs/quick-start/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertIn("EMR User Quick Start", detail.data["title"])
        self.assertIn("content", detail.data)

    def test_unauthenticated_user_rejected(self):
        resp = self.client.post(
            "/api/v1/support/tickets/",
            {
                "category": "technical",
                "priority": "medium",
                "subject": "Test",
                "description": "Test body",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_fields_rejected(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            "/api/v1/support/tickets/",
            {"category": "technical"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
