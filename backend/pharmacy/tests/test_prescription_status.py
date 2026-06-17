"""Unit tests for Prescription.recalculate_status."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from patients.models import Patient
from pharmacy.models import GenericMedication, Medication, Prescription, PrescriptionItem

User = get_user_model()


class PrescriptionRecalculateStatusTests(TestCase):
    def setUp(self):
        self.patient = Patient.objects.create(
            patient_id="RX-ST-PT",
            surname="Status",
            first_name="Patient",
            gender="female",
            date_of_birth=date(1991, 3, 3),
        )
        self.doctor = User.objects.create_user(
            username="rx_status_dr",
            password="pass",
            system_role="Medical Doctor",
        )
        self.generic = GenericMedication.objects.create(
            name="Amoxicillin",
            strength="500mg",
            dosage_form="capsule",
            unit="capsule",
        )
        self.medication = Medication.objects.create(
            name="Amoxil 500mg",
            generic=self.generic,
            code="RX-ST-MED",
            unit="capsule",
            category="Antibiotics",
        )

    def _prescription_with_item(self, *, quantity="10", dispensed="0"):
        rx = Prescription.objects.create(
            prescription_id="RX-ST-001",
            patient=self.patient,
            doctor=self.doctor,
            status="pending",
        )
        PrescriptionItem.objects.create(
            prescription=rx,
            generic=self.generic,
            medication=self.medication,
            quantity=Decimal(quantity),
            dispensed_quantity=Decimal(dispensed),
            unit="capsule",
        )
        return rx

    def test_recalculate_marks_dispensed_when_all_items_complete(self):
        rx = self._prescription_with_item(dispensed="10")
        rx.recalculate_status()
        rx.refresh_from_db()
        self.assertEqual(rx.status, "dispensed")

    def test_recalculate_marks_partially_dispensed(self):
        rx = self._prescription_with_item(dispensed="4")
        rx.recalculate_status()
        rx.refresh_from_db()
        self.assertEqual(rx.status, "partially_dispensed")

    def test_recalculate_uses_fresh_db_not_stale_related_cache(self):
        rx = self._prescription_with_item()
        item = rx.medications.get()
        # Simulate dispense view: mutate item, save, then recalculate on cached prescription.
        cached_items = list(rx.medications.all())
        self.assertEqual(len(cached_items), 1)

        item.dispensed_quantity = Decimal("10")
        item.is_dispensed = True
        item.save(update_fields=["dispensed_quantity", "is_dispensed"])

        # Related manager still holds pre-save rows until re-queried.
        self.assertEqual(cached_items[0].dispensed_quantity, Decimal("0"))

        rx.recalculate_status()
        rx.refresh_from_db()
        self.assertEqual(rx.status, "dispensed")
