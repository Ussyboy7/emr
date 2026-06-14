"""Tests for annual check-up component rules."""

from datetime import date
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from patients.annual_checkup_components import TIER_A_CODES, compute_required_components


class ComputeRequiredComponentsTests(SimpleTestCase):
    def _patient(self, **kwargs):
        p = MagicMock()
        p.pk = 1
        p.gender = kwargs.get("gender", "male")
        p.age = kwargs.get("age", 30)
        p.medical_history = MagicMock()
        p.medical_history.family_history = kwargs.get("family_history", [])
        p.medical_history.social_history = kwargs.get("social_history", {})
        p.medical_history.diagnoses = kwargs.get("diagnoses", [])
        return p

    @patch("patients.annual_checkup_components._latest_bmi", return_value=None)
    def test_tier_a_always_included(self, _bmi):
        required = compute_required_components(self._patient(), 2026)
        for code in TIER_A_CODES:
            self.assertIn(code, required)

    @patch("patients.annual_checkup_components._latest_bmi", return_value=None)
    def test_ecg_for_age_40_plus(self, _bmi):
        required = compute_required_components(self._patient(age=42), 2026)
        self.assertIn("ecg", required)

    @patch("patients.annual_checkup_components._latest_bmi", return_value=None)
    def test_psa_male_50_plus(self, _bmi):
        required = compute_required_components(self._patient(gender="male", age=55), 2026)
        self.assertIn("psa", required)

    @patch("patients.annual_checkup_components._latest_bmi", return_value=None)
    def test_mammography_female_40_plus(self, _bmi):
        required = compute_required_components(self._patient(gender="female", age=45), 2026)
        self.assertIn("mammography", required)

    @patch("patients.annual_checkup_components._is_smoker", return_value=True)
    @patch("patients.annual_checkup_components._latest_bmi", return_value=None)
    def test_chest_xray_smoker(self, _bmi, _smoker):
        required = compute_required_components(self._patient(), 2026)
        self.assertIn("chest_xray", required)
