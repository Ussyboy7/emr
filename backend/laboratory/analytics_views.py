"""Laboratory module analytics API."""
from collections import defaultdict

from django.db.models import Count, Q
from django.db.models import Case, CharField, Count, IntegerField, Sum, Value, When
from django.db.models.functions import ExtractYear, TruncDate, TruncMonth, TruncWeek
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.module_analytics import (
    npa_staff_vs_non_npa,
    parse_analytics_dates,
    patient_category_breakdown,
    patient_gender_breakdown,
)
from laboratory.models import LabOrder, LabTest
from patients.models import Patient


class LaboratoryAnalyticsSummaryView(APIView):
    """
    GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
    Tests and orders are scoped by lab order ordered_at.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        parsed = parse_analytics_dates(request)
        if isinstance(parsed, Response):
            return parsed
        start_dt, end_dt = parsed

        order_filter = Q(ordered_at__gte=start_dt, ordered_at__lte=end_dt)
        test_filter = Q(order__ordered_at__gte=start_dt, order__ordered_at__lte=end_dt)

        orders_qs = LabOrder.objects.filter(order_filter)
        tests_qs = LabTest.objects.filter(test_filter)

        orders_count = orders_qs.count()
        tests_total = tests_qs.count()
        tests_verified = tests_qs.filter(status="verified").count()
        tests_results_ready = tests_qs.filter(status="results_ready").count()
        tests_rejected = tests_qs.filter(status="rejected").count()

        patient_ids = orders_qs.values_list("patient_id", flat=True).distinct()
        patients_qs = Patient.objects.filter(id__in=patient_ids)
        unique_patients = patients_qs.count()

        gender = patient_gender_breakdown(patients_qs)
        category = patient_category_breakdown(patients_qs)
        staff_split = npa_staff_vs_non_npa(category)

        status_rows = (
            tests_qs.values("status").annotate(count=Count("id")).order_by("-count")
        )
        status_breakdown = {r["status"]: r["count"] for r in status_rows}

        method_rows = (
            tests_qs.exclude(processing_method__isnull=True)
            .exclude(processing_method="")
            .values("processing_method")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        processing_method = {r["processing_method"]: r["count"] for r in method_rows}
        in_house_count = processing_method.get("in_house", 0)
        outsourced_count = processing_method.get("outsourced", 0)
        processing_summary = {
            "in_house": in_house_count,
            "outsourced": outsourced_count,
            "unassigned": max(tests_total - in_house_count - outsourced_count, 0),
            "total": tests_total,
        }

        source_rows = (
            orders_qs.values("source_type")
            .annotate(orders=Count("id", distinct=True), tests=Count("tests", distinct=True))
            .order_by("-orders")
        )
        orders_by_source = {
            (row["source_type"] or "internal_emr"): {
                "orders": row["orders"],
                "tests": row["tests"],
            }
            for row in source_rows
        }

        external_orders_qs = orders_qs.filter(source_type="external_manual")
        external_clinic_rows = (
            external_orders_qs.values(
                "external_clinic_id",
                "external_clinic__name",
                "external_clinic__code",
            )
            .annotate(orders=Count("id", distinct=True), tests=Count("tests", distinct=True))
            .order_by("-orders", "external_clinic__name")
        )
        external_by_clinic = [
            {
                "clinic_id": row["external_clinic_id"],
                "clinic_name": row["external_clinic__name"] or "Unspecified clinic",
                "clinic_code": row["external_clinic__code"] or "",
                "orders": row["orders"],
                "tests": row["tests"],
            }
            for row in external_clinic_rows
        ]

        daily = (
            LabTest.objects.filter(test_filter)
            .annotate(day=TruncDate("order__ordered_at"))
            .values("day")
            .annotate(tests=Count("id"), orders=Count("order_id", distinct=True))
            .order_by("day")
        )
        by_day = [
            {
                "date": row["day"].isoformat() if row["day"] else None,
                "tests": row["tests"],
                "orders": row["orders"],
            }
            for row in daily
            if row["day"]
        ]

        weekly = (
            LabTest.objects.filter(test_filter)
            .annotate(w=TruncWeek("order__ordered_at"))
            .values("w")
            .annotate(tests=Count("id"), orders=Count("order_id", distinct=True))
            .order_by("w")
        )
        by_week = [
            {
                "week": row["w"].strftime("%Y-%m-%d") if row["w"] else None,
                "tests": row["tests"],
                "orders": row["orders"],
            }
            for row in weekly
            if row["w"]
        ]

        monthly = (
            LabTest.objects.filter(test_filter)
            .annotate(m=TruncMonth("order__ordered_at"))
            .values("m")
            .annotate(tests=Count("id"), orders=Count("order_id", distinct=True))
            .order_by("m")
        )
        by_month = [
            {
                "month": row["m"].strftime("%Y-%m") if row["m"] else None,
                "tests": row["tests"],
                "orders": row["orders"],
            }
            for row in monthly
            if row["m"]
        ]

        # Bimonthly
        bimonthly = (
            LabTest.objects.filter(test_filter)
            .annotate(
                year=ExtractYear("order__ordered_at"),
                bimonth=Case(
                    When(order__ordered_at__month__in=[1, 2], then=Value(1)),
                    When(order__ordered_at__month__in=[3, 4], then=Value(2)),
                    When(order__ordered_at__month__in=[5, 6], then=Value(3)),
                    When(order__ordered_at__month__in=[7, 8], then=Value(4)),
                    When(order__ordered_at__month__in=[9, 10], then=Value(5)),
                    When(order__ordered_at__month__in=[11, 12], then=Value(6)),
                    output_field=IntegerField()
                )
            )
            .values("year", "bimonth")
            .annotate(tests=Count("id"), orders=Count("order_id", distinct=True))
            .order_by("year", "bimonth")
        )
        by_bimonth = [
            {
                "bimonth": f"{row['year']}-B{row['bimonth']}",
                "tests": row["tests"],
                "orders": row["orders"],
            }
            for row in bimonthly
        ]

        quarterly = (
            LabTest.objects.filter(test_filter)
            .annotate(
                year=ExtractYear("order__ordered_at"),
                quarter=Case(
                    When(order__ordered_at__month__in=[1, 2, 3], then=Value(1)),
                    When(order__ordered_at__month__in=[4, 5, 6], then=Value(2)),
                    When(order__ordered_at__month__in=[7, 8, 9], then=Value(3)),
                    default=Value(4),
                    output_field=IntegerField(),
                ),
            )
            .values("year", "quarter")
            .annotate(tests=Count("id"), orders=Count("order_id", distinct=True))
            .order_by("year", "quarter")
        )
        by_quarter = [
            {
                "quarter": f"{row['year']}-Q{row['quarter']}",
                "tests": row["tests"],
                "orders": row["orders"],
            }
            for row in quarterly
        ]

        halfyearly = (
            LabTest.objects.filter(test_filter)
            .annotate(
                year=ExtractYear("order__ordered_at"),
                half=Case(
                    When(order__ordered_at__month__lte=6, then=Value('H1')),
                    default=Value('H2'),
                    output_field=CharField()
                )
            )
            .values("year", "half")
            .annotate(tests=Count("id"), orders=Count("order_id", distinct=True))
            .order_by("year", "half")
        )
        by_halfyear = [
            {
                "halfyear": f"{row['year']}-{row['half']}",
                "tests": row["tests"],
                "orders": row["orders"],
            }
            for row in halfyearly
        ]

        top_tests = list(
            tests_qs.values("code", "name")
            .annotate(count=Count("id"))
            .order_by("-count")[:30]
        )

        template_cat = (
            tests_qs.exclude(template__isnull=True)
            .values("template__category")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        by_template_category = {
            (r["template__category"] or "uncategorized"): r["count"] for r in template_cat
        }

        # Detailed investigation breakdown grouped by lab class
        investigation_rows = (
            tests_qs.values(
                "template__category",
                "code",
                "name",
                "processing_method",
            )
            .annotate(count=Count("id"))
            .order_by("template__category", "name", "code")
        )

        grouped = defaultdict(
            lambda: {
                "total": 0,
                "processing": {"in_house": 0, "outsourced": 0, "unassigned": 0},
                "investigations": defaultdict(
                    lambda: {
                        "code": "",
                        "name": "",
                        "count": 0,
                        "processing": {"in_house": 0, "outsourced": 0, "unassigned": 0},
                    }
                ),
            }
        )

        for row in investigation_rows:
            category_name = (row.get("template__category") or "uncategorized").strip().lower()
            method = (row.get("processing_method") or "").strip().lower()
            normalized_method = method if method in {"in_house", "outsourced"} else "unassigned"
            test_count = int(row.get("count", 0) or 0)
            code = row.get("code") or ""
            name = row.get("name") or "Unknown"
            key = f"{code}||{name}"

            cat_bucket = grouped[category_name]
            cat_bucket["total"] += test_count
            cat_bucket["processing"][normalized_method] += test_count

            inv_bucket = cat_bucket["investigations"][key]
            inv_bucket["code"] = code
            inv_bucket["name"] = name
            inv_bucket["count"] += test_count
            inv_bucket["processing"][normalized_method] += test_count

        category_breakdown = {}
        for category_name, bucket in grouped.items():
            investigations = sorted(
                bucket["investigations"].values(),
                key=lambda x: (-x["count"], x["name"]),
            )
            category_breakdown[category_name] = {
                "total": bucket["total"],
                "processing": bucket["processing"],
                "investigations": investigations,
            }

        major_classes = ["hematology", "chemistry", "microbiology"]
        major_class_breakdown = {
            class_name: category_breakdown.get(
                class_name,
                {
                    "total": 0,
                    "processing": {"in_house": 0, "outsourced": 0, "unassigned": 0},
                    "investigations": [],
                },
            )
            for class_name in major_classes
        }

        return Response(
            {
                "period": {
                    "start": start_dt.date().isoformat(),
                    "end": end_dt.date().isoformat(),
                },
                "summary": {
                    "orders_count": orders_count,
                    "tests_total": tests_total,
                    "tests_verified": tests_verified,
                    "tests_results_ready": tests_results_ready,
                    "tests_rejected": tests_rejected,
                    "unique_patients": unique_patients,
                },
                "patients_by_gender": gender,
                "patients_by_category": category,
                "npa_staff_linked_vs_non_npa": staff_split,
                "tests_by_status": status_breakdown,
                "tests_by_processing_method": processing_method,
                "tests_processing_summary": processing_summary,
                "orders_by_source": orders_by_source,
                "external_orders_by_clinic": external_by_clinic,
                "by_day": by_day,
                "by_week": by_week,
                "by_month": by_month,
                "by_bimonth": by_bimonth,
                "by_quarter": by_quarter,
                "by_halfyear": by_halfyear,
                "top_tests": [
                    {"code": r["code"], "name": r["name"], "count": r["count"]}
                    for r in top_tests
                ],
                "tests_by_template_category": by_template_category,
                "tests_by_category_with_investigations": category_breakdown,
                "major_lab_classes": major_class_breakdown,
            }
        )
