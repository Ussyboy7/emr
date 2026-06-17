"""Pharmacy dispense API tests — stock decrement and validation."""
from datetime import date, time
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from common.tests.support import grant_pages
from patients.models import Patient
from pharmacy.models import (
    DispensaryReceiptLine,
    GenericMedication,
    Medication,
    Prescription,
    PrescriptionItem,
)

User = get_user_model()


class PharmacyDispenseApiTests(TestCase):
    def setUp(self):
        self.pharmacist = User.objects.create_user(
            username="pharm_dispense",
            password="testpass123",
            system_role="Pharmacist",
            first_name="Pharma",
            last_name="Cist",
        )
        grant_pages(self.pharmacist, ["/pharmacy", "/pharmacy/prescriptions"])

        self.client = APIClient()
        self.client.force_authenticate(user=self.pharmacist)

        self.patient = Patient.objects.create(
            patient_id="PH-PT-001",
            surname="Dispense",
            first_name="Patient",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        self.doctor = User.objects.create_user(
            username="pharm_dr",
            password="testpass123",
            system_role="Medical Doctor",
        )

        self.generic = GenericMedication.objects.create(
            name="Paracetamol",
            strength="500mg",
            dosage_form="tablet",
            unit="tablet",
        )
        self.medication = Medication.objects.create(
            name="Panadol 500mg",
            generic=self.generic,
            code="PH-MED-001",
            unit="tablet",
            category="Analgesics",
        )
        self.prescription = Prescription.objects.create(
            prescription_id="RX-PH-TEST-001",
            patient=self.patient,
            doctor=self.doctor,
            created_by=self.doctor,
            status="pending",
        )
        self.item = PrescriptionItem.objects.create(
            prescription=self.prescription,
            generic=self.generic,
            medication=self.medication,
            quantity=Decimal("10"),
            unit="tablet",
        )
        self.receipt_line = DispensaryReceiptLine.objects.create(
            medication=self.medication,
            quantity=Decimal("100"),
            quantity_remaining=Decimal("100"),
            received_at=timezone.now(),
            batch_number="BATCH-001",
        )

    def _dispense_url(self):
        return f"/api/v1/pharmacy/prescriptions/{self.prescription.pk}/dispense/"

    def test_dispense_decrements_receipt_line_and_marks_item(self):
        res = self.client.post(
            self._dispense_url(),
            {
                "item_id": self.item.pk,
                "quantity": "2",
                "coverage_quantity": "2",
                "receipt_line_id": self.receipt_line.pk,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.receipt_line.refresh_from_db()
        self.item.refresh_from_db()
        self.prescription.refresh_from_db()

        self.assertEqual(self.receipt_line.quantity_remaining, Decimal("98"))
        self.assertEqual(self.item.dispensed_quantity, Decimal("2"))
        self.assertFalse(self.item.is_dispensed)

    def test_dispense_rejects_insufficient_stock(self):
        res = self.client.post(
            self._dispense_url(),
            {
                "item_id": self.item.pk,
                "quantity": "150",
                "coverage_quantity": "10",
                "receipt_line_id": self.receipt_line.pk,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Insufficient stock", res.data.get("error", ""))

        self.receipt_line.refresh_from_db()
        self.assertEqual(self.receipt_line.quantity_remaining, Decimal("100"))

    def test_dispense_rejects_zero_quantity(self):
        res = self.client.post(
            self._dispense_url(),
            {
                "item_id": self.item.pk,
                "quantity": "0",
                "coverage_quantity": "0",
                "receipt_line_id": self.receipt_line.pk,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_full_dispense_marks_item_and_prescription_dispensed(self):
        res = self.client.post(
            self._dispense_url(),
            {
                "item_id": self.item.pk,
                "quantity": "2",
                "coverage_quantity": "10",
                "receipt_line_id": self.receipt_line.pk,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.item.refresh_from_db()
        self.receipt_line.refresh_from_db()
        self.prescription.refresh_from_db()
        self.assertEqual(self.item.dispensed_quantity, Decimal("10"))
        self.assertTrue(self.item.is_dispensed)
        self.assertEqual(self.receipt_line.quantity_remaining, Decimal("98"))
        self.assertEqual(self.prescription.status, "dispensed")
