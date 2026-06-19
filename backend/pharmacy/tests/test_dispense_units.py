"""Tests for pack vs unit dispensing rules."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from pharmacy.dispense_units import (
    DISPENSE_MODE_PACK_ONLY,
    DISPENSE_MODE_PACK_OR_UNITS,
    display_to_inventory_units,
    infer_dispense_mode,
    validate_inventory_units,
)
from pharmacy.models import GenericMedication, Medication


def _make_capsule_med(*, pack_size=10, dispense_mode=DISPENSE_MODE_PACK_OR_UNITS):
    generic = GenericMedication.objects.create(
        name="Artemether/Lumefantrine",
        strength="80/480mg",
        dosage_form="capsule",
        unit="capsule",
    )
    med = Medication.objects.create(
        name="Amatem Softgel 80/480mg",
        generic=generic,
        code=f"AMA-{pack_size}-{dispense_mode}",
        unit="capsule",
        pack_size=pack_size,
        dispense_mode=dispense_mode,
        category="Antimalarials",
    )
    return med


class DispenseUnitsTest(TestCase):
    def test_infer_dispense_mode_for_capsule(self):
        self.assertEqual(infer_dispense_mode("capsule", "Softgel Capsule"), DISPENSE_MODE_PACK_OR_UNITS)

    def test_infer_dispense_mode_for_bottle(self):
        self.assertEqual(infer_dispense_mode("bottle", "Syrup"), DISPENSE_MODE_PACK_ONLY)

    def test_pack_entry_converts_to_units(self):
        med = _make_capsule_med()
        units = display_to_inventory_units(med, Decimal("2"), "pack")
        self.assertEqual(units, Decimal("20"))

    def test_units_entry_for_pack_or_units(self):
        med = _make_capsule_med()
        units = display_to_inventory_units(med, Decimal("3"), "units")
        self.assertEqual(units, Decimal("3"))

    def test_pack_only_rejects_units_entry(self):
        med = _make_capsule_med(pack_size=1, dispense_mode=DISPENSE_MODE_PACK_ONLY)
        med.unit = "bottle"
        med.save(update_fields=["unit"])
        with self.assertRaises(ValidationError):
            display_to_inventory_units(med, Decimal("1"), "units")

    def test_pack_only_requires_whole_pack_multiples(self):
        med = _make_capsule_med(dispense_mode=DISPENSE_MODE_PACK_ONLY)
        with self.assertRaises(ValidationError):
            validate_inventory_units(med, Decimal("5"), "pack")

    def test_pack_only_accepts_whole_pack_multiples(self):
        med = _make_capsule_med(dispense_mode=DISPENSE_MODE_PACK_ONLY)
        validate_inventory_units(med, Decimal("10"), "pack")
