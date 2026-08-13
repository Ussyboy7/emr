"""Category ordering safeguards for report exports."""
from datetime import date

from django.test import TestCase

from reports.attendance_statistics import build_attendance_statistics_csv
from reports.attendance_statistics_pdf import _matrix_table
from reports.observation_admissions import build_observation_admissions_report


EXPECTED_CATEGORIES = [
    "Officers",
    "Staff",
    "Employee Dependants",
    "Retirees",
    "Retiree Dependents",
    "Non NPA",
]


class CategoryOrderTest(TestCase):
    def test_attendance_csv_uses_canonical_category_order(self):
        report = {
            "period_start": date(2026, 1, 1),
            "period_end": date(2026, 1, 31),
            "clinics": [],
        }

        lines = build_attendance_statistics_csv(report).splitlines()

        self.assertEqual(lines[3].split(",")[2:8], EXPECTED_CATEGORIES)

    def test_attendance_pdf_uses_canonical_category_order_for_headers_and_cells(self):
        report = {
            "clinics": [
                {
                    "label": "Clinic",
                    "rows": [
                        {
                            "gender_label": "Total",
                            "gender": "total",
                            "staff": 2,
                            "officers": 1,
                            "employee_dependants": 3,
                            "retirees": 4,
                            "retiree_dependents": 5,
                            "non_npa": 6,
                            "row_total": 21,
                        }
                    ],
                }
            ]
        }

        table = _matrix_table(report, use_pdf_labels=False)
        headers = [cell.getPlainText() for cell in table._cellvalues[0]]
        cells = [cell.getPlainText() for cell in table._cellvalues[1][1:7]]

        self.assertEqual(headers[1:7], ["OFFICERS", "STAFF", "EMP. DEP.", "RETIREE", "RET. DEP.", "NON NPA"])
        self.assertEqual(cells, ["1", "2", "3", "4", "5", "6"])

    def test_observation_report_uses_canonical_category_order(self):
        report = build_observation_admissions_report(date(2026, 1, 1), date(2026, 1, 31))

        self.assertEqual([row["category"] for row in report["data"]], EXPECTED_CATEGORIES)
