"""Unit tests for NotificationService.notify_role."""
from django.contrib.auth import get_user_model
from django.test import TestCase

from common.tests.support import create_clinic_department, create_nursing_officer
from notifications.models import Notification
from notifications.services import NotificationService

User = get_user_model()


class NotifyRoleTests(TestCase):
    def test_notify_role_creates_in_app_notification_for_matching_users(self):
        nurse = create_nursing_officer("role_nurse")
        User.objects.create_user(
            username="other_role",
            password="pass",
            system_role="Medical Doctor",
        )

        created = NotificationService.notify_role(
            role_name="Nursing Officer",
            title="Test alert",
            message="Pool queue update",
            notification_type="workflow",
            priority="high",
            action_url="/nursing/pool-queue",
        )

        self.assertEqual(len(created), 1)
        self.assertEqual(created[0].user_id, nurse.id)
        self.assertEqual(Notification.objects.filter(user=nurse).count(), 1)

    def test_notify_role_respects_clinic_scope(self):
        clinic_a, dept_a = create_clinic_department(
            clinic_code="CL-A",
            dept_code="NURSING",
            dept_name="Nursing",
        )
        clinic_b, dept_b = create_clinic_department(
            clinic_code="CL-B",
            dept_code="NURSING-B",
            dept_name="Nursing",
        )

        nurse_a = create_nursing_officer("nurse_a", clinic=clinic_a, department=dept_a)
        create_nursing_officer("nurse_b", clinic=clinic_b, department=dept_b)

        created = NotificationService.notify_role(
            role_name="Nursing Officer",
            title="Scoped",
            message="Clinic A only",
            clinic_id=clinic_a.id,
        )

        self.assertEqual(len(created), 1)
        self.assertEqual(created[0].user_id, nurse_a.id)
