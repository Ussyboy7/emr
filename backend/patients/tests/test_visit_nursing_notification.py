"""Tests for visit status → nursing notification workflow."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from notifications.models import Notification
from patients.models import Patient, Visit
from common.tests.support import create_nursing_officer

User = get_user_model()


class VisitNursingNotificationTests(TestCase):
    def setUp(self):
        self.nurse = create_nursing_officer("nurse_notify")
        self.admin = User.objects.create_superuser(
            username="records_admin",
            password="testpass123",
            email="admin@test.local",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

        self.patient = Patient.objects.create(
            patient_id="VN-PT-001",
            surname="Notify",
            first_name="Patient",
            gender="female",
            date_of_birth=date(1988, 5, 5),
        )

    def test_create_scheduled_visit_does_not_notify_nursing(self):
        before = Notification.objects.filter(user=self.nurse).count()
        res = self.client.post(
            "/api/v1/visits/",
            {
                "patient": self.patient.pk,
                "date": date.today().isoformat(),
                "time": "09:00:00",
                "visit_type": "consultation",
                "status": "scheduled",
                "clinic": "GOPD",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        after = Notification.objects.filter(user=self.nurse).count()
        self.assertEqual(before, after)

    def test_forward_to_nursing_notifies_nursing_officers(self):
        visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(10, 0),
            status="scheduled",
            visit_type="consultation",
            clinic="GOPD",
        )
        before = Notification.objects.filter(user=self.nurse).count()

        res = self.client.patch(
            f"/api/v1/visits/{visit.pk}/",
            {"status": "in_progress"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        notifications = Notification.objects.filter(user=self.nurse).order_by("-id")
        self.assertEqual(notifications.count(), before + 1)
        latest = notifications.first()
        self.assertEqual(latest.notification_type, "workflow")
        self.assertEqual(latest.priority, "high")
        self.assertEqual(latest.action_url, "/nursing/pool-queue")
        self.assertEqual(latest.object_type, "visit")
        self.assertEqual(latest.object_id, str(visit.id))
        self.assertIn("Nursing", latest.title)

    def test_no_notification_when_status_unchanged(self):
        visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(11, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )
        before = Notification.objects.filter(user=self.nurse).count()

        res = self.client.patch(
            f"/api/v1/visits/{visit.pk}/",
            {"clinical_notes": "Updated notes only"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.filter(user=self.nurse).count(), before)

    def test_scheduled_visit_excluded_from_nursing_pool_list(self):
        scheduled = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(8, 0),
            status="scheduled",
            visit_type="consultation",
            clinic="GOPD",
        )
        in_progress = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(9, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )

        res = self.client.get(
            f"/api/v1/visits/?date={date.today().isoformat()}&nursing_pool=1",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data["results"]}
        self.assertNotIn(scheduled.id, ids)
        self.assertIn(in_progress.id, ids)

    def test_scheduled_visit_excluded_from_nursing_pool_list(self):
        scheduled = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(8, 0),
            status="scheduled",
            visit_type="consultation",
            clinic="GOPD",
        )
        in_progress = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(9, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )

        res = self.client.get(
            f"/api/v1/visits/?date={date.today().isoformat()}&nursing_pool=1",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data["results"]}
        self.assertNotIn(scheduled.id, ids)
        self.assertIn(in_progress.id, ids)
