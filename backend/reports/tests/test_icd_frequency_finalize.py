"""Unit tests for shared ICD frequency finalize helpers (Top N / family / search)."""

from django.test import SimpleTestCase

from reports.icd_diagnosis_aggregation import finalize_icd_frequency_report


class FinalizeIcdFrequencyReportTests(SimpleTestCase):
    def setUp(self):
        self.counts = {
            ("B54", "Unspecified malaria"): 2,
            ("B50", "Falciparum malaria"): 1,
            ("I10", "Essential hypertension"): 1,
        }

    def test_search_filters_codes(self):
        data, summary = finalize_icd_frequency_report(self.counts, search="malaria")
        self.assertEqual(summary["distinct_icd10_codes"], 2)
        self.assertEqual(summary["grand_total"], 3)
        self.assertEqual({row["code"] for row in data}, {"B54", "B50"})

    def test_group_by_family(self):
        data, summary = finalize_icd_frequency_report(self.counts, group_by="family")
        self.assertEqual(summary["group_by"], "family")
        self.assertEqual(summary["distinct_icd10_codes"], 3)
        self.assertEqual(summary["ranking_count"], 2)
        by_code = {row["code"]: row for row in data}
        malaria = by_code["B50–B54"]
        self.assertEqual(malaria["count"], 3)
        self.assertEqual(malaria["codes_count"], 2)
        self.assertEqual(malaria["description"], "Malaria")

    def test_limit_top_n(self):
        data, summary = finalize_icd_frequency_report(self.counts, limit=1)
        self.assertEqual(len(data), 1)
        self.assertEqual(summary["ranking_count"], 1)
        self.assertEqual(data[0]["code"], "B54")
        self.assertEqual(data[0]["sn"], 1)

    def test_pagination(self):
        data, summary = finalize_icd_frequency_report(
            self.counts, limit=None, page=2, page_size=1
        )
        self.assertEqual(len(data), 1)
        self.assertEqual(summary["ranking_count"], 3)
        self.assertEqual(data[0]["sn"], 2)
