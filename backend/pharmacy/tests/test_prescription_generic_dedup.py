"""Tests for superseding duplicate generic prescription lines."""
from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from common.tests.support import create_test_user
from organization.models import Clinic
from patients.models import Patient
from pharmacy.models import GenericMedication, Medication, Prescription, PrescriptionItem
from pharmacy.prescription_lines import repair_all_redundant_generic_siblings, supersede_redundant_generic_siblings


class SupersedeDuplicateGenericLinesTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name="Bode Thomas Clinic", code="BODE-THOMAS")
        cls.user = create_test_user("rx_dedup", pages=["/pharmacy"], system_role="Pharmacist")
        cls.user.location_clinic = cls.clinic
        cls.user.save(update_fields=["location_clinic"])
        cls.patient = Patient.objects.create(
            patient_id="RX-DEDUP-PT",
            surname="Patient",
            first_name="Test",
            gender="male",
            date_of_birth=date(1995, 1, 1),
            location_clinic=cls.clinic,
        )
        cls.generic = GenericMedication.objects.create(
            name="Indapamide",
            atc_code="C03BA11",
            dosage_form="Tablet",
            strength="1.5mg",
        )
        cls.brand = Medication.objects.create(
            name="Natrilix SR 1.5mg",
            code="NAT15",
            generic=cls.generic,
            strength="1.5mg",
            form="Tablet",
            unit="tablet",
        )

    def _make_rx(self):
        return Prescription.objects.create(
            prescription_id=f"RX-DEDUP-{timezone.now().timestamp()}",
            patient=self.patient,
            doctor=self.user,
            location_clinic=self.clinic,
        )

    def test_fully_dispensed_brand_supersedes_undispensed_generic_duplicate(self):
        rx = self._make_rx()
        generic_line = PrescriptionItem.objects.create(
            prescription=rx,
            generic=self.generic,
            quantity=Decimal("28"),
            unit="tablet",
        )
        brand_line = PrescriptionItem.objects.create(
            prescription=rx,
            generic=self.generic,
            medication=self.brand,
            quantity=Decimal("28"),
            unit="tablet",
            dispensed_quantity=Decimal("28"),
            is_dispensed=True,
        )

        count = supersede_redundant_generic_siblings(rx.pk, brand_line.pk)
        self.assertEqual(count, 1)

        generic_line.refresh_from_db()
        self.assertIsNotNone(generic_line.superseded_at)

    def test_partial_dispense_does_not_supersede_sibling(self):
        rx = self._make_rx()
        generic_line = PrescriptionItem.objects.create(
            prescription=rx,
            generic=self.generic,
            quantity=Decimal("28"),
            unit="tablet",
        )
        brand_line = PrescriptionItem.objects.create(
            prescription=rx,
            generic=self.generic,
            medication=self.brand,
            quantity=Decimal("28"),
            unit="tablet",
            dispensed_quantity=Decimal("10"),
            is_dispensed=False,
        )

        count = supersede_redundant_generic_siblings(rx.pk, brand_line.pk)
        self.assertEqual(count, 0)
        generic_line.refresh_from_db()
        self.assertIsNone(generic_line.superseded_at)

    def test_repair_all_updates_prescription_status(self):
        rx = self._make_rx()
        PrescriptionItem.objects.create(
            prescription=rx,
            generic=self.generic,
            quantity=Decimal("28"),
            unit="tablet",
        )
        PrescriptionItem.objects.create(
            prescription=rx,
            generic=self.generic,
            medication=self.brand,
            quantity=Decimal("28"),
            unit="tablet",
            dispensed_quantity=Decimal("28"),
            is_dispensed=True,
        )
        rx.status = "partially_dispensed"
        rx.save(update_fields=["status"])

        repaired = repair_all_redundant_generic_siblings()
        self.assertGreaterEqual(repaired, 1)

        rx.refresh_from_db()
        self.assertEqual(rx.status, "dispensed")
