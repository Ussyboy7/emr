"""Comprehensive API tests for Nursing Orders."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from common.tests.support import create_test_patient_visit, grant_pages
from nursing.models import NursingOrder
from patients.models import Patient, Visit

User = get_user_model()

BASE_URL = "/api/v1/nursing/orders/"


def detail_url(pk):
    return f"{BASE_URL}{pk}/"


class NursingOrderAPITestCase(TestCase):
    """Base class with shared fixtures for nursing-order API tests."""

    def setUp(self):
        self.doctor = User.objects.create_user(
            username="order_doc",
            password="pass12345",
            first_name="Alice",
            last_name="Doctor",
            system_role="Medical Doctor",
        )
        grant_pages(self.doctor, ["/nursing", "/nursing/procedures", "/consultation"])

        self.nurse = User.objects.create_user(
            username="order_nurse",
            password="pass12345",
            first_name="Bob",
            last_name="Nurse",
            system_role="Nursing Officer",
        )
        grant_pages(self.nurse, ["/nursing", "/nursing/procedures", "/nursing/pool-queue"])

        self.patient = Patient.objects.create(
            patient_id="NORD-PT-001",
            surname="Banda",
            first_name="James",
            gender="male",
            date_of_birth=date(1988, 4, 15),
        )
        self.patient2 = Patient.objects.create(
            patient_id="NORD-PT-002",
            surname="Phiri",
            first_name="Mary",
            gender="female",
            date_of_birth=date(1995, 11, 3),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(9, 0),
            status="in_progress",
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.doctor)

        self.valid_payload = {
            "patient": self.patient.id,
            "order_type": "Injection",
            "description": "IM Diclofenac 75mg stat",
            "priority": "medium",
            "visit": self.visit.id,
            "ordered_by": self.doctor.id,
        }

    def _create_order(self, **overrides):
        """Shortcut to create a NursingOrder via the ORM."""
        defaults = {
            "patient": self.patient,
            "order_type": "Injection",
            "description": "IM Diclofenac 75mg",
            "priority": "medium",
            "ordered_by": self.doctor,
            "created_by": self.doctor,
        }
        defaults.update(overrides)
        return NursingOrder.objects.create(**defaults)


class NursingOrderCreateTests(NursingOrderAPITestCase):
    """POST /api/v1/nursing/orders/"""

    def test_create_order_with_required_fields(self):
        resp = self.client.post(BASE_URL, self.valid_payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["order_id"].startswith("NORD-"))
        self.assertEqual(resp.data["status"], "pending")
        self.assertEqual(resp.data["priority"], "medium")
        self.assertEqual(resp.data["patient"], self.patient.id)

    def test_create_order_auto_generates_order_id(self):
        resp = self.client.post(BASE_URL, self.valid_payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        order_id = resp.data["order_id"]
        self.assertRegex(order_id, r"^NORD-\d{8}-\d{4}$")

    def test_create_order_sets_created_by(self):
        resp = self.client.post(BASE_URL, self.valid_payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["created_by"], self.doctor.id)

    def test_create_order_missing_patient_returns_400(self):
        payload = {**self.valid_payload}
        del payload["patient"]
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("patient", resp.data)

    def test_create_order_missing_description_returns_400(self):
        payload = {**self.valid_payload}
        del payload["description"]
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("description", resp.data)

    def test_create_order_missing_order_type_returns_400(self):
        payload = {**self.valid_payload}
        del payload["order_type"]
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order_type", resp.data)

    def test_create_with_urgent_priority(self):
        payload = {**self.valid_payload, "priority": "urgent"}
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["priority"], "urgent")

    def test_create_order_normalizes_ward_admission_type(self):
        payload = {**self.valid_payload, "order_type": "ward admission"}
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["order_type"], "observation admission")

    def test_create_multiple_orders_unique_ids(self):
        r1 = self.client.post(BASE_URL, self.valid_payload, format="json")
        r2 = self.client.post(BASE_URL, self.valid_payload, format="json")
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(r1.data["order_id"], r2.data["order_id"])


class NursingOrderListTests(NursingOrderAPITestCase):
    """GET /api/v1/nursing/orders/"""

    def setUp(self):
        super().setUp()
        self.order1 = self._create_order(
            patient=self.patient, order_type="Injection", status="pending", priority="high",
        )
        self.order2 = self._create_order(
            patient=self.patient2, order_type="Dressing", status="completed", priority="low",
        )
        self.order3 = self._create_order(
            patient=self.patient, order_type="Medication", status="in_progress", priority="urgent",
        )

    def test_list_returns_all_orders(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 3)

    def test_filter_by_patient(self):
        resp = self.client.get(BASE_URL, {"patient": self.patient.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 2)
        self.assertTrue(all(r["patient"] == self.patient.id for r in results))

    def test_filter_by_status(self):
        resp = self.client.get(BASE_URL, {"status": "pending"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["status"], "pending")

    def test_filter_by_priority(self):
        resp = self.client.get(BASE_URL, {"priority": "urgent"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["priority"], "urgent")

    def test_filter_by_order_type(self):
        resp = self.client.get(BASE_URL, {"order_type": "Injection"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertTrue(all(r["order_type"] == "Injection" for r in results))

    def test_filter_by_ordered_by(self):
        resp = self.client.get(BASE_URL, {"ordered_by": self.doctor.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 3)


class NursingOrderRetrieveTests(NursingOrderAPITestCase):
    """GET /api/v1/nursing/orders/{pk}/"""

    def test_retrieve_order_by_pk(self):
        order = self._create_order()
        resp = self.client.get(detail_url(order.id))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], order.id)
        self.assertEqual(resp.data["order_id"], order.order_id)
        self.assertEqual(resp.data["patient_name"], "Banda James")

    def test_retrieve_nonexistent_order_returns_404(self):
        resp = self.client.get(detail_url(99999))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_includes_computed_fields(self):
        order = self._create_order()
        resp = self.client.get(detail_url(order.id))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("patient_name", resp.data)
        self.assertIn("patient_patient_id", resp.data)
        self.assertIn("patient_gender", resp.data)
        self.assertIn("patient_age", resp.data)
        self.assertIn("ordered_by_name", resp.data)


class NursingOrderUpdateTests(NursingOrderAPITestCase):
    """PATCH/PUT /api/v1/nursing/orders/{pk}/"""

    def test_patch_description(self):
        order = self._create_order()
        resp = self.client.patch(
            detail_url(order.id),
            {"description": "Updated dosage instructions"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.description, "Updated dosage instructions")

    def test_patch_priority(self):
        order = self._create_order(priority="low")
        resp = self.client.patch(
            detail_url(order.id),
            {"priority": "high"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.priority, "high")

    def test_patch_frequency_and_duration(self):
        order = self._create_order()
        resp = self.client.patch(
            detail_url(order.id),
            {"frequency": "8-hourly", "duration": "5 days"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.frequency, "8-hourly")
        self.assertEqual(order.duration, "5 days")


class NursingOrderStatusTransitionTests(NursingOrderAPITestCase):
    """Status lifecycle: pending → in_progress → completed / cancelled."""

    def test_transition_pending_to_in_progress(self):
        order = self._create_order(status="pending")
        resp = self.client.patch(
            detail_url(order.id), {"status": "in_progress"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, "in_progress")

    def test_transition_in_progress_to_completed(self):
        order = self._create_order(status="in_progress")
        resp = self.client.patch(
            detail_url(order.id), {"status": "completed"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, "completed")

    def test_transition_pending_to_cancelled(self):
        order = self._create_order(status="pending")
        resp = self.client.patch(
            detail_url(order.id), {"status": "cancelled"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, "cancelled")

    def test_transition_in_progress_to_cancelled(self):
        order = self._create_order(status="in_progress")
        resp = self.client.patch(
            detail_url(order.id), {"status": "cancelled"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, "cancelled")

    def test_update_completed_order_rejected(self):
        order = self._create_order(status="completed")
        resp = self.client.patch(
            detail_url(order.id),
            {"description": "Try to modify finalized order"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_cancelled_order_rejected(self):
        order = self._create_order(status="cancelled")
        resp = self.client.patch(
            detail_url(order.id),
            {"description": "Try to modify cancelled order"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancel_completed_order_rejected(self):
        order = self._create_order(status="completed")
        resp = self.client.patch(
            detail_url(order.id), {"status": "cancelled"}, format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class NursingOrderDeleteTests(NursingOrderAPITestCase):
    """DELETE /api/v1/nursing/orders/{pk}/"""

    def test_delete_order(self):
        order = self._create_order()
        resp = self.client.delete(detail_url(order.id))
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(NursingOrder.objects.filter(pk=order.id).exists())

    def test_delete_nonexistent_order_returns_404(self):
        resp = self.client.delete(detail_url(99999))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class NursingOrderSearchTests(NursingOrderAPITestCase):
    """Search via ?search= query param."""

    def setUp(self):
        super().setUp()
        self.order_a = self._create_order(description="Administer IV Ceftriaxone 1g")
        self.order_b = self._create_order(
            patient=self.patient2, description="Wound dressing change",
        )

    def test_search_by_description(self):
        resp = self.client.get(BASE_URL, {"search": "Ceftriaxone"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 1)
        self.assertIn("Ceftriaxone", results[0]["description"])

    def test_search_by_patient_name(self):
        resp = self.client.get(BASE_URL, {"search": "Phiri"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 1)

    def test_search_by_patient_id(self):
        resp = self.client.get(BASE_URL, {"search": "NORD-PT-001"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertTrue(len(results) >= 1)

    def test_search_by_order_id(self):
        resp = self.client.get(BASE_URL, {"search": self.order_a.order_id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["order_id"], self.order_a.order_id)

    def test_search_no_match_returns_empty(self):
        resp = self.client.get(BASE_URL, {"search": "NONEXISTENT_XYZ_999"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 0)


class NursingOrderListStatsTests(NursingOrderAPITestCase):
    """GET /api/v1/nursing/orders/list-stats/"""

    STATS_URL = f"{BASE_URL}list-stats/"

    def setUp(self):
        super().setUp()
        self._create_order(status="pending", order_type="Injection")
        self._create_order(status="pending", order_type="IV Infusion")
        self._create_order(status="completed", order_type="Dressing")
        self._create_order(status="in_progress", order_type="Medication")

    def test_list_stats_returns_counts(self):
        resp = self.client.get(self.STATS_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["total"], 4)
        self.assertEqual(resp.data["pending"], 2)
        self.assertEqual(resp.data["completed"], 1)

    def test_list_stats_injection_count(self):
        resp = self.client.get(self.STATS_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["injections"], 2)

    def test_list_stats_with_patient_filter(self):
        self._create_order(patient=self.patient2, status="pending", order_type="Injection")
        resp = self.client.get(self.STATS_URL, {"patient": self.patient.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["total"], 4)


class NursingOrderQueueTests(NursingOrderAPITestCase):
    """Queue filtering: procedures_queue and queue_type params."""

    def setUp(self):
        super().setUp()
        self._create_order(order_type="Injection", status="pending", priority="urgent")
        self._create_order(order_type="Dressing", status="pending", priority="low")
        self._create_order(order_type="ward instruction", status="pending")
        self._create_order(order_type="Medication", status="pending")

    def test_procedures_queue_excludes_ward_instructions(self):
        resp = self.client.get(BASE_URL, {"procedures_queue": "1"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        types = [r["order_type"].lower() for r in results]
        self.assertNotIn("ward instruction", types)
        self.assertEqual(len(results), 3)

    def test_queue_type_injection(self):
        resp = self.client.get(BASE_URL, {"queue_type": "injection"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 1)

    def test_queue_type_dressing(self):
        resp = self.client.get(BASE_URL, {"queue_type": "dressing"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 1)

    def test_queue_type_medication(self):
        resp = self.client.get(BASE_URL, {"queue_type": "medication"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(len(results), 1)

    def test_procedures_queue_priority_ordering(self):
        """With procedures_queue=1 and no explicit ordering, urgent orders come first."""
        resp = self.client.get(BASE_URL, {"procedures_queue": "1"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertEqual(results[0]["priority"], "urgent")


class NursingOrderAuthTests(TestCase):
    """Authentication / permission checks."""

    def setUp(self):
        self.anon_client = APIClient()
        self.patient = Patient.objects.create(
            patient_id="AUTH-PT-001",
            surname="Auth",
            first_name="Test",
            gender="male",
            date_of_birth=date(2000, 1, 1),
        )

    def test_unauthenticated_list_returns_401(self):
        resp = self.anon_client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_create_returns_401(self):
        resp = self.anon_client.post(BASE_URL, {
            "patient": self.patient.id,
            "order_type": "Injection",
            "description": "Attempt",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_detail_returns_401(self):
        resp = self.anon_client.get(detail_url(1))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_delete_returns_401(self):
        resp = self.anon_client.delete(detail_url(1))
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class NursingOrderModelTests(NursingOrderAPITestCase):
    """Model-level sanity checks."""

    def test_order_str_representation(self):
        order = self._create_order()
        text = str(order)
        self.assertIn(order.order_id, text)
        self.assertIn("James", text)

    def test_default_status_is_pending(self):
        order = self._create_order()
        self.assertEqual(order.status, "pending")

    def test_default_priority_is_medium(self):
        order = NursingOrder.objects.create(
            patient=self.patient,
            order_type="Observation",
            description="Monitor BP",
            ordered_by=self.doctor,
            created_by=self.doctor,
        )
        self.assertEqual(order.priority, "medium")
