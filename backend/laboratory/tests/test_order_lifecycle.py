"""Lab order lifecycle tests — create order with tests, list, filter."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user, create_test_patient_visit


class LabOrderCreateTest(APITestCase):
    """POST /api/v1/laboratory/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.doctor = create_test_user("lab_dr", pages=["/consultation", "/laboratory"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="LAB-ORD-01")

    def setUp(self):
        self.client.force_authenticate(user=self.doctor)

    def test_create_order_with_tests(self):
        resp = self.client.post("/api/v1/laboratory/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "priority": "routine",
            "clinical_notes": "Routine labs",
            "tests_data": [
                {"name": "Full Blood Count", "code": "FBC", "sample_type": "blood", "status": "pending"},
                {"name": "Urinalysis", "code": "UA", "sample_type": "urine", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_create_order_requires_patient(self):
        resp = self.client.post("/api/v1/laboratory/orders/", {
            "priority": "routine",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_second_create_same_visit_appends_when_pending(self):
        first = self.client.post("/api/v1/laboratory/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "priority": "routine",
            "tests_data": [
                {"name": "Full Blood Count", "code": "FBC", "sample_type": "blood", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post("/api/v1/laboratory/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "priority": "urgent",
            "tests_data": [
                {"name": "Malaria Parasite", "code": "MP", "sample_type": "blood", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertTrue(second.data.get("merged_into_existing"))
        self.assertEqual(second.data.get("priority"), "urgent")
        from laboratory.models import LabOrder
        order = LabOrder.objects.get(pk=first.data["id"])
        self.assertEqual(order.tests.count(), 2)

    def test_list_returns_nested_patient_object(self):
        created = self.client.post("/api/v1/laboratory/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "priority": "routine",
            "tests_data": [
                {"name": "Full Blood Count", "code": "FBC", "sample_type": "blood", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertIsInstance(created.data.get("patient"), dict)
        self.assertTrue(created.data["patient"].get("name"))

        listed = self.client.get("/api/v1/laboratory/orders/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        row = next(r for r in listed.data["results"] if r["id"] == created.data["id"])
        self.assertIsInstance(row.get("patient"), dict)
        self.assertTrue(row["patient"].get("name"))
        self.assertIsInstance(row.get("doctor"), (dict, type(None)))

    def test_historical_merge_pending_same_visit(self):
        from laboratory.models import LabOrder
        from laboratory.order_merge import merge_pending_same_visit_lab_orders

        first = self.client.post("/api/v1/laboratory/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "priority": "routine",
            "tests_data": [
                {"name": "Full Blood Count", "code": "FBC", "sample_type": "blood", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        # Simulate a pre-append duplicate by creating a second order directly.
        from laboratory.models import LabTest
        donor = LabOrder.objects.create(
            patient_id=self.patient.pk,
            visit_id=self.visit.pk,
            doctor=self.doctor,
            priority="routine",
        )
        LabTest.objects.create(
            order=donor,
            name="Urinalysis",
            code="UA",
            sample_type="urine",
            status="pending",
        )
        LabTest.objects.create(
            order=donor,
            name="Full Blood Count",
            code="FBC",
            sample_type="blood",
            status="pending",
        )
        result = merge_pending_same_visit_lab_orders()
        self.assertEqual(result["merged_groups"], 1)
        self.assertFalse(LabOrder.objects.filter(pk=donor.pk).exists())
        keeper = LabOrder.objects.get(pk=first.data["id"])
        codes = set(keeper.tests.values_list("code", flat=True))
        self.assertEqual(codes, {"FBC", "UA"})


class LabOrderListTest(APITestCase):
    """GET /api/v1/laboratory/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("lab_list", pages=["/laboratory"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="LAB-LIST-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_list_returns_200(self):
        resp = self.client.get("/api/v1/laboratory/orders/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_filter_by_patient(self):
        self.client.post("/api/v1/laboratory/orders/", {
            "patient": self.patient.pk,
            "priority": "urgent",
            "tests_data": [{"name": "RBS", "code": "RBS", "sample_type": "blood", "status": "pending"}],
        }, format="json")
        resp = self.client.get(f"/api/v1/laboratory/orders/?patient={self.patient.pk}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)

    def test_stats_endpoint(self):
        resp = self.client.get("/api/v1/laboratory/orders/stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class LabOrderRBACTest(APITestCase):
    """Users without /laboratory page get 403."""

    @classmethod
    def setUpTestData(cls):
        cls.no_lab = create_test_user("no_lab", pages=["/nursing"])

    def test_no_lab_page_returns_403(self):
        self.client.force_authenticate(user=self.no_lab)
        resp = self.client.get("/api/v1/laboratory/orders/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
