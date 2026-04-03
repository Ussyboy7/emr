"""Radiology module analytics API."""
from collections import defaultdict

from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.module_analytics import (
    npa_staff_vs_non_npa,
    parse_analytics_dates,
    patient_category_breakdown,
    patient_gender_breakdown,
)
from patients.models import Patient
from radiology.models import RadiologyOrder, RadiologyStudy


class RadiologyAnalyticsSummaryView(APIView):
    """
    GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
    Studies and orders scoped by radiology order ordered_at.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        parsed = parse_analytics_dates(request)
        if isinstance(parsed, Response):
            return parsed
        start_dt, end_dt = parsed

        order_filter = Q(ordered_at__gte=start_dt, ordered_at__lte=end_dt)
        study_filter = Q(order__ordered_at__gte=start_dt, order__ordered_at__lte=end_dt)

        orders_qs = RadiologyOrder.objects.filter(order_filter)
        studies_qs = RadiologyStudy.objects.filter(study_filter)

        orders_count = orders_qs.count()
        studies_total = studies_qs.count()
        studies_verified = studies_qs.filter(status="verified").count()
        studies_reported = studies_qs.filter(status="reported").count()
        studies_critical = studies_qs.filter(critical=True).count()

        patient_ids = orders_qs.values_list("patient_id", flat=True).distinct()
        patients_qs = Patient.objects.filter(id__in=patient_ids)
        unique_patients = patients_qs.count()

        gender = patient_gender_breakdown(patients_qs)
        category = patient_category_breakdown(patients_qs)
        staff_split = npa_staff_vs_non_npa(category)

        status_rows = (
            studies_qs.values("status").annotate(count=Count("id")).order_by("-count")
        )
        status_breakdown = {r["status"]: r["count"] for r in status_rows}

        modality_rows = (
            studies_qs.exclude(modality__isnull=True)
            .exclude(modality="")
            .values("modality")
            .annotate(count=Count("id"))
            .order_by("-count")[:20]
        )
        by_modality = {r["modality"]: r["count"] for r in modality_rows}

        template_cat = (
            studies_qs.exclude(template__isnull=True)
            .values("template__category")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        by_template_category = {
            (r["template__category"] or "uncategorized"): r["count"] for r in template_cat
        }

        method_rows = (
            studies_qs.exclude(processing_method__isnull=True)
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
            "unassigned": max(studies_total - in_house_count - outsourced_count, 0),
            "total": studies_total,
        }

        procedure_method_rows = (
            studies_qs.values("procedure", "processing_method")
            .annotate(count=Count("id"))
            .order_by("procedure")
        )
        procedures_processing = defaultdict(
            lambda: {
                "procedure": "",
                "total": 0,
                "processing": {"in_house": 0, "outsourced": 0, "unassigned": 0},
            }
        )
        for row in procedure_method_rows:
            procedure = (row.get("procedure") or "Unknown procedure").strip()
            method = (row.get("processing_method") or "").strip().lower()
            normalized_method = method if method in {"in_house", "outsourced"} else "unassigned"
            count = int(row.get("count", 0) or 0)
            bucket = procedures_processing[procedure]
            bucket["procedure"] = procedure
            bucket["total"] += count
            bucket["processing"][normalized_method] += count

        procedures_processing_breakdown = sorted(
            procedures_processing.values(),
            key=lambda x: (-x["total"], x["procedure"]),
        )

        daily = (
            RadiologyStudy.objects.filter(study_filter)
            .annotate(day=TruncDate("order__ordered_at"))
            .values("day")
            .annotate(studies=Count("id"), orders=Count("order_id", distinct=True))
            .order_by("day")
        )
        by_day = [
            {
                "date": row["day"].isoformat() if row["day"] else None,
                "studies": row["studies"],
                "orders": row["orders"],
            }
            for row in daily
            if row["day"]
        ]

        top_procedures = list(
            studies_qs.values("procedure")
            .annotate(count=Count("id"))
            .order_by("-count")[:30]
        )

        priority_rows = (
            orders_qs.values("priority").annotate(count=Count("id")).order_by("-count")
        )
        orders_by_priority = {r["priority"]: r["count"] for r in priority_rows}

        return Response(
            {
                "period": {
                    "start": start_dt.date().isoformat(),
                    "end": end_dt.date().isoformat(),
                },
                "summary": {
                    "orders_count": orders_count,
                    "studies_total": studies_total,
                    "studies_verified": studies_verified,
                    "studies_reported": studies_reported,
                    "studies_marked_critical": studies_critical,
                    "unique_patients": unique_patients,
                },
                "patients_by_gender": gender,
                "patients_by_category": category,
                "npa_staff_linked_vs_non_npa": staff_split,
                "studies_by_status": status_breakdown,
                "studies_by_modality": by_modality,
                "studies_by_template_category": by_template_category,
                "studies_by_processing_method": processing_method,
                "studies_processing_summary": processing_summary,
                "procedures_by_processing_method": procedures_processing_breakdown,
                "orders_by_priority": orders_by_priority,
                "by_day": by_day,
                "top_procedures": [
                    {"procedure": r["procedure"], "count": r["count"]} for r in top_procedures
                ],
            }
        )
