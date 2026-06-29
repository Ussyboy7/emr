from django.test import SimpleTestCase

from pharmacy.units import infer_dose_unit, resolve_prescription_unit


class PrescriptionUnitsTests(SimpleTestCase):
    def test_softgel_capsule_form_infers_capsule(self):
        self.assertEqual(infer_dose_unit("Softgel Capsule"), "capsule")

    def test_tablet_form_infers_tablet(self):
        self.assertEqual(infer_dose_unit("Tablet"), "tablet")

    def test_resolve_rejects_tablet_default_for_softgel(self):
        self.assertEqual(
            resolve_prescription_unit(
                unit="tablet",
                dosage_form="Softgel Capsule",
                generic_unit="",
            ),
            "capsule",
        )

    def test_resolve_prefers_generic_unit(self):
        self.assertEqual(
            resolve_prescription_unit(
                unit="tablet",
                dosage_form="Tablet",
                generic_unit="capsule",
            ),
            "capsule",
        )
