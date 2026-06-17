"""Notification preference filter tests."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from datetime import time as dt_time

from notifications.models import NotificationPreferences
from notifications.services import NotificationService

User = get_user_model()


class NotificationPreferenceFilterTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="notif_prefs",
            password="pass",
        )

    def test_should_send_in_app_respects_module_toggle(self):
        prefs = NotificationService.get_or_create_preferences(self.user)
        prefs.lab_results_enabled = False
        prefs.save(update_fields=["lab_results_enabled"])

        self.assertFalse(
            NotificationService.should_send_in_app(self.user, "lab_result", "normal")
        )
        self.assertTrue(
            NotificationService.should_send_in_app(self.user, "workflow", "normal")
        )

    def test_should_send_in_app_respects_quiet_hours(self):
        prefs = NotificationService.get_or_create_preferences(self.user)
        now = timezone.localtime()
        prefs.quiet_hours_enabled = True
        prefs.quiet_hours_start = dt_time(0, 0)
        prefs.quiet_hours_end = dt_time(23, 59, 59)
        prefs.save(
            update_fields=["quiet_hours_enabled", "quiet_hours_start", "quiet_hours_end"]
        )

        # With quiet hours spanning essentially all day, filters should block.
        self.assertFalse(
            NotificationService._passes_filters(self.user, "workflow", "normal")
        )

    def test_create_notification_skipped_when_in_app_disabled(self):
        prefs = NotificationService.get_or_create_preferences(self.user)
        prefs.in_app_enabled = False
        prefs.email_enabled = False
        prefs.save(update_fields=["in_app_enabled", "email_enabled"])

        result = NotificationService.create_notification(
            user=self.user,
            title="Should not appear",
            message="Disabled channels",
            notification_type="workflow",
            priority="normal",
        )
        self.assertIsNone(result)
