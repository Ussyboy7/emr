"""Tests for common API views."""
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient


class ServerTimeViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_server_time_returns_payload(self):
        res = self.client.get("/api/v1/common/server-time/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("date", res.data)
        self.assertIn("datetime", res.data)
        self.assertIn("timezone", res.data)
