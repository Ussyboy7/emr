"""Ensure nested lab test creation accepts custom tests without a template FK."""
from django.test import SimpleTestCase

from laboratory.serializers import LabTestCreateSerializer


class LabTestCreateSerializerTests(SimpleTestCase):
    databases = []  # serializer validation only; no DB required
    def test_template_null_is_valid(self):
        serializer = LabTestCreateSerializer(
            data={
                "name": "Send-out metabolic panel",
                "code": "CUSTOM_MET",
                "sample_type": "Blood",
                "status": "pending",
                "template": None,
                "notes": "Not in catalog",
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_omit_template_is_valid(self):
        serializer = LabTestCreateSerializer(
            data={
                "name": "Ad hoc culture",
                "code": "ADHOC1",
                "sample_type": "Swab",
                "status": "pending",
                "notes": "",
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
