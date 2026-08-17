from datetime import date

from django.test import SimpleTestCase

from common.report_period import apply_date_preset


class RecordingQuerySet:
    def __init__(self):
        self.filters = []

    def filter(self, **kwargs):
        self.filters.append(kwargs)
        return self


class ReportPeriodDateFilterTests(SimpleTestCase):
    def test_datetime_preset_uses_half_open_timestamp_range(self):
        qs = RecordingQuerySet()

        apply_date_preset(qs, "today", "created_at")

        self.assertEqual(set(qs.filters[0]), {"created_at__gte", "created_at__lt"})
        self.assertLess(qs.filters[0]["created_at__gte"], qs.filters[0]["created_at__lt"])

    def test_date_field_keeps_date_comparison(self):
        qs = RecordingQuerySet()

        apply_date_preset(qs, "today", "date")

        self.assertEqual(qs.filters, [{"date": date.today()}])
