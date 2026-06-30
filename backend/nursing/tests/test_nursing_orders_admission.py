"""API tests: admission filter on nursing orders and finalized order updates."""
from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from nursing.models import NursingOrder
from patients.models import Patient, Visit
from wards.models import Ward, PatientAdmission
from common.tests.support import grant_pages

User = get_user_model()


class NursingOrderAdmissionApiTests(TestCase):
    """Regression: ward doctor orders link to admission; finalized orders are immutable."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="wardordertest",
            password="pass12345",
            first_name="Test",
            last_name="User",
        )
        self.user.system_role = "Medical Doctor"
        self.user.save(update_fields=["system_role"])
        grant_pages(self.user, ["/nursing", "/consultation/wards"])

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            patient_id="WOTEST-PT-001",
            surname="Case",
            first_name="Patient",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date(2026, 3, 24),
            time=time(10, 0),
            status="in_progress",
        )
        self.ward = Ward.objects.create(
            ward_code="WOTEST-W1",
            name="Test Ward",
            total_beds=5,
            occupied_beds=1,
        )
        self.admission = PatientAdmission.objects.create(
            patient=self.patient,
            visit=self.visit,
            ward=self.ward,
            admission_diagnosis="Observation",
            status="admitted",
        )

        NursingOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            admission=self.admission,
            order_type="ward instruction",
            description="Monitor vitals",
            ordered_by=self.user,
            created_by=self.user,
        )
        NursingOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            admission=self.admission,
            order_type="medication",
            description="Paracetamol 500mg",
            ordered_by=self.user,
            created_by=self.user,
        )

    def test_list_orders_filtered_by_admission(self):
        url = f"/api/v1/nursing/orders/?admission={self.admission.id}"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get("results", [])
        self.assertEqual(len(results), 2)
        types = {r["order_type"].lower() for r in results}
        self.assertIn("ward instruction", types)
        self.assertIn("medication", types)

    def test_patch_completed_order_rejected(self):
        order = NursingOrder.objects.filter(order_type__iexact="ward instruction").first()
        self.assertIsNotNone(order)
        order.status = "completed"
        order.save(update_fields=["status"])

        res = self.client.patch(
            f"/api/v1/nursing/orders/{order.id}/",
            {"description": "Should not apply"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_pending_order_cancel_ok(self):
        order = NursingOrder.objects.filter(order_type__iexact="medication").first()
        self.assertIsNotNone(order)
        self.assertEqual(order.status, "pending")

        res = self.client.patch(
            f"/api/v1/nursing/orders/{order.id}/",
            {"status": "cancelled"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, "cancelled")

    def test_for_admission_excludes_unlinked_visit_orders(self):
        orphan = NursingOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            order_type="injection",
            description="Ceftriaxone 1g IM",
            ordered_by=self.user,
            created_by=self.user,
            ordered_at=timezone.now(),
        )
        self.assertIsNone(orphan.admission_id)

        url = f"/api/v1/nursing/orders/?for_admission={self.admission.id}"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {r["id"] for r in res.data.get("results", [])}
        self.assertNotIn(orphan.id, ids)

    def test_for_admission_excludes_pre_admission_orders(self):
        early = NursingOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            admission=self.admission,
            order_type="dressing",
            description="Pre-stay dressing",
            ordered_by=self.user,
            created_by=self.user,
        )
        NursingOrder.objects.filter(pk=early.pk).update(
            ordered_at=self.admission.admission_date - timedelta(hours=2),
        )

        url = f"/api/v1/nursing/orders/?for_admission={self.admission.id}"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {r["id"] for r in res.data.get("results", [])}
        self.assertNotIn(early.id, ids)

    def test_create_auto_links_active_admission(self):
        payload = {
            "patient": self.patient.id,
            "visit": self.visit.id,
            "order_type": "injection",
            "description": "Vitamin B12 IM",
            "status": "pending",
            "priority": "medium",
        }
        res = self.client.post("/api/v1/nursing/orders/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["admission"], self.admission.id)

    def test_create_rejects_admission_patient_mismatch(self):
        other_patient = Patient.objects.create(
            patient_id="WOTEST-PT-002",
            surname="Other",
            first_name="Patient",
            gender="female",
            date_of_birth=date(1992, 2, 2),
        )
        payload = {
            "patient": other_patient.id,
            "visit": self.visit.id,
            "admission": self.admission.id,
            "order_type": "injection",
            "description": "Wrong patient link",
            "status": "pending",
            "priority": "medium",
        }
        res = self.client.post("/api/v1/nursing/orders/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("admission", res.data)
