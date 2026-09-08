"""Store stock summary must match clinic-scoped inventory batches."""
from datetime import date, timedelta
from decimal import Decimal

from rest_framework.test import APITestCase

from common.tests.support import create_test_user
from organization.models import Clinic, SystemConfig
from pharmacy.central_store import CENTRAL_STORE_CLINIC_CODE
from pharmacy.models import GenericMedication, Medication, MedicationInventory


class StoreStockSummaryClinicScopeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled",
            defaults={"value": "true", "description": "test"},
        )
        cls.central, _ = Clinic.objects.get_or_create(
            code=CENTRAL_STORE_CLINIC_CODE,
            defaults={"name": "Bode Thomas Clinic"},
        )
        cls.other, _ = Clinic.objects.get_or_create(
            code="TEST-OTHER-SITE-STOCK",
            defaults={"name": "Other Test Clinic"},
        )
        cls.user = create_test_user(
            "store_stock_user",
            pages=["/pharmacy", "/pharmacy/store"],
            system_role="Pharmacist",
        )
        cls.user.location_clinic = cls.central
        cls.user.location_clinics.add(cls.central)
        cls.user.active_clinic = cls.central
        cls.user.save()

        cls.generic = GenericMedication.objects.create(
            name="Amlodipine",
            strength="10mg",
            dosage_form="tablet",
            unit="tablet",
            category="Antihypertensives",
        )
        cls.med = Medication.objects.create(
            name="Amlong 10mg Test",
            code="AML-TEST-10",
            generic=cls.generic,
            strength="10mg",
            form="Tablet",
            category="Antihypertensives",
            pack_size=30,
            unit="tablet",
            min_stock_level=Decimal("20"),
            is_active=True,
        )
        expiry = date.today() + timedelta(days=400)
        MedicationInventory.objects.create(
            medication=cls.med,
            batch_number="BATCH-CENTRAL-1",
            expiry_date=expiry,
            quantity=Decimal("100"),
            unit="tablet",
            location="Store",
            location_clinic=cls.central,
            min_stock_level=Decimal("20"),
        )
        MedicationInventory.objects.create(
            medication=cls.med,
            batch_number="BATCH-ORPHAN-1",
            expiry_date=expiry,
            quantity=Decimal("24600"),
            unit="tablet",
            location="Store",
            location_clinic=None,
            min_stock_level=Decimal("20"),
        )
        MedicationInventory.objects.create(
            medication=cls.med,
            batch_number="BATCH-OTHER-1",
            expiry_date=expiry,
            quantity=Decimal("500"),
            unit="tablet",
            location="Store",
            location_clinic=cls.other,
            min_stock_level=Decimal("20"),
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_summary_only_counts_active_clinic_batches(self):
        res = self.client.get(
            "/api/v1/pharmacy/medications/store-stock-summary/",
            {"location": "Store", "search": "Amlong 10mg Test"},
        )
        self.assertEqual(res.status_code, 200, res.data)
        rows = res.data.get("results") or res.data
        row = next(r for r in rows if r["id"] == self.med.id)
        self.assertEqual(Decimal(str(row["store_quantity"])), Decimal("100"))
        self.assertEqual(row["batch_count"], 1)

    def test_inventory_list_matches_summary_quantity(self):
        inv = self.client.get(
            "/api/v1/pharmacy/inventory/",
            {"medication": self.med.id, "location": "Store", "page_size": 50},
        )
        self.assertEqual(inv.status_code, 200, inv.data)
        batches = inv.data.get("results") or []
        self.assertEqual(len(batches), 1)
        self.assertEqual(batches[0]["batch_number"], "BATCH-CENTRAL-1")
        total = sum(Decimal(str(b["quantity"])) for b in batches)

        summary = self.client.get(
            "/api/v1/pharmacy/medications/store-stock-summary/",
            {"location": "Store", "search": "Amlong 10mg Test"},
        )
        row = next(
            r for r in (summary.data.get("results") or summary.data) if r["id"] == self.med.id
        )
        self.assertEqual(Decimal(str(row["store_quantity"])), total)
        self.assertEqual(row["batch_count"], len(batches))

    def test_receive_sets_central_store_clinic(self):
        payload = {
            "medication_id": self.med.id,
            "batch_number": "BATCH-NEW-RECEIVE",
            "expiry_date": (date.today() + timedelta(days=200)).isoformat(),
            "quantity": "30",
            "unit": "tablet",
            "location": "Store",
            "min_stock_level": "20",
        }
        res = self.client.post("/api/v1/pharmacy/inventory/", payload, format="json")
        self.assertIn(res.status_code, (200, 201), res.data)
        created = MedicationInventory.objects.get(batch_number="BATCH-NEW-RECEIVE")
        self.assertEqual(created.location_clinic_id, self.central.id)
