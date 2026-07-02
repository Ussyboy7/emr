"""Lab attendance report tests."""
from datetime import date

from django.test import TestCase

from reports.lab_attendance_report import build_lab_attendance_report, medical_exam_lab_orders_filter


class LabAttendanceReportTest(TestCase):
    def test_medical_exam_filter_includes_annual_checkup_visit_type(self):
        filt = medical_exam_lab_orders_filter(date(2026, 1, 1), date(2026, 1, 31))
        self.assertIn("annual_checkup", str(filt))

    def test_build_report_includes_medical_exam_row(self):
        report = build_lab_attendance_report(date(2026, 1, 1), date(2026, 1, 31))
        rows = report.get("data") or []
        med = next((r for r in rows if r.get("category") == "Medical Exam"), None)
        self.assertIsNotNone(med)
        self.assertIn("source", med)
