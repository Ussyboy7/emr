from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from common.tests.support import grant_pages
from laboratory.models import LabOrder, LabResult, LabTemplate, LabTest
from patients.models import Patient


class LabVerificationDateFilterTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="labtester",
            password="pass1234",
            system_role="Laboratory Scientist",
        )
        grant_pages(self.user, ["/laboratory"])
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            patient_id="P-TEST-001",
            surname="Test",
            first_name="Patient",
            gender="male",
            date_of_birth="1990-01-01",
        )
        self.template = LabTemplate.objects.create(
            name="Glucose",
            code="GLU",
            sample_type="Blood",
            normal_range={"Glucose": {"min": 70, "max": 140, "unit": "mg/dL"}},
        )
        self.order = LabOrder.objects.create(
            order_id="LAB-TEST-001",
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            clinic="GOPD",
        )

    def _make_result(self, *, test_status: str, processed_days_ago: int = 0, verified_days_ago: int = 0):
        now = timezone.now()
        test = LabTest.objects.create(
            order=self.order,
            template=self.template,
            name="Glucose",
            code="GLU",
            sample_type="Blood",
            status=test_status,
            results={"Glucose": "110"},
            processed_by=self.user,
            processed_at=now - timedelta(days=processed_days_ago),
            verified_by=self.user if test_status == "verified" else None,
            verified_at=(now - timedelta(days=verified_days_ago)) if test_status == "verified" else None,
        )
        return LabResult.objects.create(
            test=test,
            order=self.order,
            patient=self.patient,
            overall_status="normal",
            priority="medium",
        )

    def test_pending_verification_date_filter_uses_processed_date(self):
        self._make_result(test_status="results_ready", processed_days_ago=0)
        self._make_result(test_status="results_ready", processed_days_ago=3)

        today = timezone.now().date().isoformat()
        url = "/api/laboratory/verification/"
        resp = self.client.get(url, {"status": "results_ready", "date": today})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)

    def test_verified_verification_date_filter_uses_verified_date(self):
        self._make_result(test_status="verified", verified_days_ago=0)
        self._make_result(test_status="verified", verified_days_ago=4)

        today = timezone.now().date().isoformat()
        url = "/api/laboratory/verification/"
        resp = self.client.get(url, {"status": "verified", "date": today})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)


class LabOrderStatsTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="laborderstats",
            password="pass1234",
            system_role="Laboratory Scientist",
        )
        grant_pages(self.user, ["/laboratory"])
        self.client.force_authenticate(user=self.user)
        self.patient = Patient.objects.create(
            patient_id="P-TEST-002",
            surname="Order",
            first_name="Stats",
            gender="female",
            date_of_birth="1992-01-01",
        )
        self.template = LabTemplate.objects.create(
            name="CBC",
            code="CBC",
            sample_type="Blood",
            normal_range={"WBC": {"min": 4, "max": 11}},
        )

    def _make_order_with_test(self, *, order_id: str, test_status: str, days_ago: int):
        now = timezone.now()
        order = LabOrder.objects.create(
            order_id=order_id,
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            clinic="GOPD",
            priority="routine",
        )
        LabOrder.objects.filter(id=order.id).update(ordered_at=now - timedelta(days=days_ago))
        LabTest.objects.create(
            order=order,
            template=self.template,
            name="CBC",
            code="CBC",
            sample_type="Blood",
            status=test_status,
            results={"WBC": "7.0"},
        )
        return order

    def test_order_stats_respect_date_filter(self):
        self._make_order_with_test(order_id="LAB-STATS-1", test_status="pending", days_ago=0)
        self._make_order_with_test(order_id="LAB-STATS-2", test_status="processing", days_ago=5)

        today = timezone.now().date().isoformat()
        resp = self.client.get("/api/laboratory/orders/stats/", {"date": today})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["total"], 1)
        self.assertEqual(resp.data["pending"], 1)
        self.assertEqual(resp.data["processing"], 0)
