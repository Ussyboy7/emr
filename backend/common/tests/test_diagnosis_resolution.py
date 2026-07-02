"""Tests for diagnosis resolution helper."""
from django.test import TestCase

from common.diagnosis_resolution import parse_order_diagnosis_text


class DiagnosisResolutionTest(TestCase):
    def test_parse_order_diagnosis_text_icd_format(self):
        raw = "[Primary] M54.5 - Low back pain\n[Secondary] M25.5 - Knee pain"
        rows = parse_order_diagnosis_text(raw)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["code"], "M54.5")

    def test_placeholder_returns_empty(self):
        self.assertEqual(parse_order_diagnosis_text("Nursing pool check-in — Physiotherapy"), [])
