"""NonNPA patient_id allocation must skip IDs that are already taken.

Registration built the next id from ``count() + 1``, which assumes the ids of a
type form a gap-free block starting at 01. Real data is not that tidy: rows can
carry legacy/whitespace variants of ``nonnpa_type`` (so they are not counted)
while still holding ``NN-{TYPE}-NN`` ids. ``Patient.save`` then retried
``count + 2``, ``count + 3`` ... and gave up after 100 attempts with
``ValueError: Unable to generate unique patient_id for nonnpa``, surfacing as a
500 on patient registration.
"""
from datetime import date

from django.test import TestCase

from patients.models import Patient


class NonNpaPatientIdAllocationTests(TestCase):
    @staticmethod
    def _patient(**kwargs):
        defaults = {
            "category": "nonnpa",
            "surname": "Visitor",
            "first_name": "Test",
            "gender": "male",
            "date_of_birth": date(1990, 1, 1),
        }
        defaults.update(kwargs)
        return Patient.objects.create(**defaults)

    def test_register_skips_ids_held_by_uncounted_rows(self):
        # 100 ids are taken, but a legacy trailing space on the type keeps the
        # count at 0, so ``count + 1`` collided on every attempt.
        for n in range(1, 101):
            self._patient(patient_id=f"NN-CSR-{n:02d}", nonnpa_type="CSR ")

        patient = self._patient(nonnpa_type="CSR")

        self.assertEqual(patient.patient_id, "NN-CSR-101")

    def test_register_after_gap_uses_next_free_sequence(self):
        self._patient(patient_id="NN-CSR-01", nonnpa_type="CSR")
        self._patient(patient_id="NN-CSR-07", nonnpa_type="CSR")

        patient = self._patient(nonnpa_type="CSR")

        self.assertEqual(patient.patient_id, "NN-CSR-08")
