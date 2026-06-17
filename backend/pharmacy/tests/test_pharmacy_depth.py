"""
Comprehensive tests for Pharmacy module: StockRequest workflows,
GenericMedication CRUD, MedicationInventory, and DispensaryReceiptLine.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_user, grant_pages
from pharmacy.models import (
    DispensaryReceiptLine,
    GenericMedication,
    Medication,
    MedicationInventory,
    StockRequest,
    StockRequestItem,
    StockIssue,
)


def _make_medication(*, generic=None, code="MED-001", name="Panadol 500mg"):
    """Helper to create a Medication with a linked generic."""
    if generic is None:
        generic = GenericMedication.objects.create(
            name="Paracetamol",
            strength="500mg",
            dosage_form="tablet",
            unit="tablet",
        )
    return Medication.objects.create(
        name=name,
        generic=generic,
        code=code,
        unit="tablet",
        category="Analgesics",
    ), generic


# ---------------------------------------------------------------------------
# StockRequest workflow tests
# ---------------------------------------------------------------------------
class StockRequestWorkflowTest(APITestCase):
    """Test StockRequest creation and status transition actions."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "sr_user",
            pages=["/pharmacy", "/pharmacy/stock-requests"],
            system_role="Pharmacist",
            superuser=True,
        )
        cls.medication, cls.generic = _make_medication()

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def _create_stock_request(self, **overrides):
        payload = {
            "from_location": "Store",
            "to_location": "Dispensary",
            "notes": "Routine restock",
            "items": [
                {"medication": self.medication.pk, "quantity": 50},
            ],
        }
        payload.update(overrides)
        return self.client.post(
            "/api/v1/pharmacy/stock-requests/", payload, format="json"
        )

    # -- creation --

    def test_create_stock_request(self):
        resp = self._create_stock_request()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "pending")
        self.assertTrue(resp.data["request_id"].startswith("REQ-"))
        self.assertEqual(len(resp.data["items"]), 1)

    def test_create_sets_requested_by(self):
        resp = self._create_stock_request()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["requested_by"], self.user.pk)

    # -- approve --

    def test_approve_pending_request(self):
        sr = self._create_stock_request().data
        resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{sr['id']}/approve/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "approved")

    def test_approve_non_pending_fails(self):
        sr = self._create_stock_request().data
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/approve/")
        resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{sr['id']}/approve/"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # -- reject --

    def test_reject_pending_request(self):
        sr = self._create_stock_request().data
        resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{sr['id']}/reject/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "rejected")

    def test_reject_non_pending_fails(self):
        sr = self._create_stock_request().data
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/approve/")
        resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{sr['id']}/reject/"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # -- cancel --

    def test_cancel_pending_request(self):
        sr = self._create_stock_request().data
        resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{sr['id']}/cancel/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "cancelled")

    def test_cancel_approved_fails(self):
        sr = self._create_stock_request().data
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/approve/")
        resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{sr['id']}/cancel/"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # -- fulfill --

    def test_fulfill_requires_approved_status(self):
        """Fulfilling a pending request must fail (must be approved first)."""
        sr = self._create_stock_request().data
        resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{sr['id']}/fulfill/"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("approved", resp.data["error"])

    def test_fulfill_approved_with_stock(self):
        """Approved request with sufficient store inventory fulfills successfully."""
        MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="B-100",
            expiry_date=date.today() + timedelta(days=365),
            quantity=Decimal("200"),
            unit="tablet",
            location="Store",
        )
        sr = self._create_stock_request().data
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/approve/")
        resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{sr['id']}/fulfill/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["request"]["status"], "fulfilled")
        self.assertIsNotNone(resp.data["issue"])

    def test_fulfill_no_stock_returns_error(self):
        """Approved request with zero store stock returns 400 with details."""
        sr = self._create_stock_request().data
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/approve/")
        resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{sr['id']}/fulfill/"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("unfulfilled_items", resp.data)

    def test_fulfill_creates_dispensary_receipt_line(self):
        """Store→Dispensary fulfillment creates a DispensaryReceiptLine."""
        MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="B-200",
            expiry_date=date.today() + timedelta(days=180),
            quantity=Decimal("100"),
            unit="tablet",
            location="Store",
        )
        sr = self._create_stock_request().data
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/approve/")
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/fulfill/")

        receipt = DispensaryReceiptLine.objects.filter(
            medication=self.medication
        ).first()
        self.assertIsNotNone(receipt)
        self.assertEqual(receipt.quantity, Decimal("50"))
        self.assertEqual(receipt.quantity_remaining, Decimal("50"))

    def test_fulfill_deducts_source_inventory(self):
        """Fulfillment deducts quantity from the source inventory batch."""
        inv = MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="B-300",
            expiry_date=date.today() + timedelta(days=365),
            quantity=Decimal("200"),
            unit="tablet",
            location="Store",
        )
        sr = self._create_stock_request().data
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/approve/")
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/fulfill/")

        inv.refresh_from_db()
        self.assertEqual(inv.quantity, Decimal("150"))

    # -- confirm receipt --

    def test_confirm_receipt_after_fulfill(self):
        MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="B-400",
            expiry_date=date.today() + timedelta(days=365),
            quantity=Decimal("100"),
            unit="tablet",
            location="Store",
        )
        sr = self._create_stock_request().data
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/approve/")
        self.client.post(f"/api/v1/pharmacy/stock-requests/{sr['id']}/fulfill/")

        resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{sr['id']}/confirm_receipt/",
            {"confirmed_notes": "All received"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["request"]["status"], "received")


# ---------------------------------------------------------------------------
# GenericMedication CRUD tests
# ---------------------------------------------------------------------------
class GenericMedicationCRUDTest(APITestCase):
    """CRUD operations on /api/v1/pharmacy/generics/."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "gen_user",
            pages=["/pharmacy"],
            system_role="Pharmacist",
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_create_generic_medication(self):
        resp = self.client.post(
            "/api/v1/pharmacy/generics/",
            {
                "name": "Amoxicillin",
                "strength": "250mg",
                "dosage_form": "capsule",
                "route": "Oral",
                "unit": "capsule",
                "category": "Antibiotics",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["name"], "Amoxicillin")
        self.assertEqual(resp.data["route"], "Oral")

    def test_list_generic_medications(self):
        GenericMedication.objects.create(name="Ibuprofen", strength="400mg")
        resp = self.client.get("/api/v1/pharmacy/generics/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_update_generic_medication(self):
        gen = GenericMedication.objects.create(
            name="Metformin", strength="500mg", dosage_form="tablet"
        )
        resp = self.client.patch(
            f"/api/v1/pharmacy/generics/{gen.pk}/",
            {"strength": "850mg"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        gen.refresh_from_db()
        self.assertEqual(gen.strength, "850mg")

    def test_delete_generic_medication(self):
        gen = GenericMedication.objects.create(
            name="Ciprofloxacin", strength="500mg", dosage_form="tablet"
        )
        resp = self.client.delete(f"/api/v1/pharmacy/generics/{gen.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(GenericMedication.objects.filter(pk=gen.pk).exists())

    def test_unique_constraint_prevents_duplicate(self):
        GenericMedication.objects.create(
            name="Aspirin",
            strength="100mg",
            dosage_form="tablet",
            route="Oral",
        )
        resp = self.client.post(
            "/api/v1/pharmacy/generics/",
            {
                "name": "Aspirin",
                "strength": "100mg",
                "dosage_form": "tablet",
                "route": "Oral",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_search_generic(self):
        GenericMedication.objects.create(
            name="Amlodipine", strength="5mg", dosage_form="tablet"
        )
        resp = self.client.get("/api/v1/pharmacy/generics/?search=Amlodipine")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertTrue(any(r["name"] == "Amlodipine" for r in results))


# ---------------------------------------------------------------------------
# MedicationInventory model / API tests
# ---------------------------------------------------------------------------
class MedicationInventoryTest(APITestCase):
    """Tests for MedicationInventory creation, stock adjustment, and expiry logic."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "inv_user",
            pages=["/pharmacy", "/pharmacy/inventory"],
            system_role="Pharmacist",
            superuser=True,
        )
        cls.medication, cls.generic = _make_medication(
            code="INV-MED-01", name="Amoxicillin 500mg"
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_create_inventory_item(self):
        resp = self.client.post(
            "/api/v1/pharmacy/inventory/",
            {
                "medication_id": self.medication.pk,
                "batch_number": "BN-001",
                "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
                "quantity": "500.00",
                "unit": "tablet",
                "min_stock_level": "50.00",
                "location": "Store",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["batch_number"], "BN-001")

    def test_is_expired_property(self):
        inv = MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="EXP-01",
            expiry_date=date.today() - timedelta(days=1),
            quantity=Decimal("10"),
            unit="tablet",
        )
        self.assertTrue(inv.is_expired)

    def test_not_expired(self):
        inv = MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="EXP-02",
            expiry_date=date.today() + timedelta(days=30),
            quantity=Decimal("10"),
            unit="tablet",
        )
        self.assertFalse(inv.is_expired)

    def test_is_low_stock_property(self):
        inv = MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="LOW-01",
            expiry_date=date.today() + timedelta(days=365),
            quantity=Decimal("5"),
            unit="tablet",
            min_stock_level=Decimal("10"),
        )
        self.assertTrue(inv.is_low_stock)

    def test_not_low_stock(self):
        inv = MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="LOW-02",
            expiry_date=date.today() + timedelta(days=365),
            quantity=Decimal("100"),
            unit="tablet",
            min_stock_level=Decimal("10"),
        )
        self.assertFalse(inv.is_low_stock)

    def test_adjust_stock_quantity(self):
        inv = MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="ADJ-01",
            expiry_date=date.today() + timedelta(days=365),
            quantity=Decimal("100"),
            unit="tablet",
            location="Store",
        )
        inv.quantity -= Decimal("30")
        inv.save()
        inv.refresh_from_db()
        self.assertEqual(inv.quantity, Decimal("70"))

    def test_str_representation(self):
        inv = MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="STR-01",
            expiry_date=date.today() + timedelta(days=365),
            quantity=Decimal("10"),
            unit="tablet",
        )
        self.assertIn(self.medication.name, str(inv))
        self.assertIn("STR-01", str(inv))

    def test_list_inventory_api(self):
        MedicationInventory.objects.create(
            medication=self.medication,
            batch_number="LIST-01",
            expiry_date=date.today() + timedelta(days=365),
            quantity=Decimal("50"),
            unit="tablet",
            location="Store",
        )
        resp = self.client.get("/api/v1/pharmacy/inventory/?location=Store")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# DispensaryReceiptLine model tests
# ---------------------------------------------------------------------------
class DispensaryReceiptLineTest(APITestCase):
    """Tests for DispensaryReceiptLine creation and validation."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "drl_user",
            pages=["/pharmacy"],
            system_role="Pharmacist",
            superuser=True,
        )
        cls.medication, cls.generic = _make_medication(
            code="DRL-MED-01", name="Diclofenac 50mg"
        )

    def test_create_receipt_line(self):
        now = timezone.now()
        line = DispensaryReceiptLine.objects.create(
            medication=self.medication,
            quantity=Decimal("200"),
            quantity_remaining=Decimal("200"),
            received_at=now,
            batch_number="DRL-B01",
            expiry_date=date.today() + timedelta(days=180),
        )
        self.assertEqual(line.quantity, Decimal("200"))
        self.assertEqual(line.quantity_remaining, Decimal("200"))
        self.assertEqual(line.batch_number, "DRL-B01")

    def test_receipt_line_str(self):
        now = timezone.now()
        line = DispensaryReceiptLine.objects.create(
            medication=self.medication,
            quantity=Decimal("100"),
            quantity_remaining=Decimal("100"),
            received_at=now,
        )
        label = str(line)
        self.assertIn(self.medication.name, label)

    def test_request_id_property_with_no_request(self):
        line = DispensaryReceiptLine.objects.create(
            medication=self.medication,
            quantity=Decimal("50"),
            quantity_remaining=Decimal("50"),
            received_at=timezone.now(),
        )
        self.assertIsNone(line.request_id)

    def test_linked_request(self):
        sr = StockRequest.objects.create(
            from_location="Store",
            to_location="Dispensary",
            requested_by=self.user,
        )
        line = DispensaryReceiptLine.objects.create(
            medication=self.medication,
            quantity=Decimal("50"),
            quantity_remaining=Decimal("50"),
            received_at=timezone.now(),
            request=sr,
        )
        self.assertEqual(line.request, sr)
        self.assertEqual(line.request.request_id, sr.request_id)

    def test_quantity_remaining_decrements(self):
        line = DispensaryReceiptLine.objects.create(
            medication=self.medication,
            quantity=Decimal("100"),
            quantity_remaining=Decimal("100"),
            received_at=timezone.now(),
        )
        line.quantity_remaining -= Decimal("25")
        line.save()
        line.refresh_from_db()
        self.assertEqual(line.quantity_remaining, Decimal("75"))


# ---------------------------------------------------------------------------
# StockRequest model-level tests (auto-generated IDs, etc.)
# ---------------------------------------------------------------------------
class StockRequestModelTest(APITestCase):
    """Unit-level checks on StockRequest model behaviour."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "sr_model_user", pages=["/pharmacy"], system_role="Pharmacist"
        )

    def test_auto_generated_request_id(self):
        sr = StockRequest.objects.create(
            from_location="Store",
            to_location="Dispensary",
            requested_by=self.user,
        )
        self.assertTrue(sr.request_id.startswith("REQ-"))
        self.assertGreater(len(sr.request_id), 10)

    def test_default_status_is_pending(self):
        sr = StockRequest.objects.create(
            from_location="Store",
            to_location="Dispensary",
            requested_by=self.user,
        )
        self.assertEqual(sr.status, "pending")

    def test_str_returns_request_id(self):
        sr = StockRequest.objects.create(
            from_location="Store",
            to_location="Dispensary",
            requested_by=self.user,
        )
        self.assertEqual(str(sr), sr.request_id)
