from django.test import SimpleTestCase

from common.search_filters import ExistsAwareSearchFilter
from laboratory.models import lab_results_payload_is_meaningful


class ExistsAwareSearchLookupTests(SimpleTestCase):
    def test_lookup_prefixes(self):
        self.assertEqual(ExistsAwareSearchFilter._lookup("name"), "name__icontains")
        self.assertEqual(ExistsAwareSearchFilter._lookup("^name"), "name__istartswith")
        self.assertEqual(ExistsAwareSearchFilter._lookup("=name"), "name__iexact")


class LabResultsPayloadTests(SimpleTestCase):
    def test_empty_and_blank_are_not_meaningful(self):
        self.assertFalse(lab_results_payload_is_meaningful({}))
        self.assertFalse(lab_results_payload_is_meaningful({"Glucose": ""}))
        self.assertFalse(lab_results_payload_is_meaningful({"Glucose": None}))

    def test_value_is_meaningful(self):
        self.assertTrue(lab_results_payload_is_meaningful({"Glucose": "110"}))
