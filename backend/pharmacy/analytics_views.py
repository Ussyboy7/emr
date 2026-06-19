"""Pharmacy module analytics (dispensing & prescribing patterns)."""
from decimal import Decimal

from django.db.models import Case, CharField, Count, IntegerField, Sum, Value, When
from django.db.models.functions import ExtractYear, TruncDate, TruncMonth, TruncWeek, TruncQuarter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.analytics_export import maybe_export_analytics
from common.module_analytics import (
    npa_staff_vs_non_npa,
    parse_analytics_dates,
    patient_category_breakdown,
    patient_gender_breakdown,
)
from common.openapi import document_api_view
from patients.models import Patient
from pharmacy.models import Dispense, Prescription, HodStockIssue


def _dec_to_float(d) -> float:
    if d is None:
        return 0.0
    if isinstance(d, Decimal):
        return float(d)
    return float(d)


@document_api_view(tag="Analytics", summary="Pharmacy analytics summary")
class PharmacyAnalyticsSummaryView(APIView):
    """
    GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
    Dispensing metrics use Dispense.dispensed_at.
    Prescribing volume uses Prescription.prescribed_at.
    """

    def get(self, request):
        parsed = parse_analytics_dates(request)
        if isinstance(parsed, Response):
            return parsed
        start_dt, end_dt, _all_time = parsed

        disp_qs = Dispense.objects.filter(
            dispensed_at__gte=start_dt, dispensed_at__lte=end_dt
        ).select_related("medication", "prescription__patient")

        dispense_events = disp_qs.count()
        agg = disp_qs.aggregate(total_qty=Sum("quantity"))
        total_quantity = _dec_to_float(agg["total_qty"])

        rx_ids = disp_qs.values_list("prescription_id", flat=True).distinct()
        prescriptions_touched = rx_ids.count()

        patient_ids = (
            Prescription.objects.filter(id__in=rx_ids)
            .values_list("patient_id", flat=True)
            .distinct()
        )
        patients_qs = Patient.objects.filter(id__in=patient_ids)
        unique_patients_dispensed = patients_qs.count()

        gender = patient_gender_breakdown(patients_qs)
        category = patient_category_breakdown(patients_qs)
        staff_split = npa_staff_vs_non_npa(category)

        daily = (
            Dispense.objects.filter(dispensed_at__gte=start_dt, dispensed_at__lte=end_dt)
            .annotate(day=TruncDate("dispensed_at"))
            .values("day")
            .annotate(
                events=Count("id"),
                quantity=Sum("quantity"),
                prescriptions=Count("prescription_id", distinct=True),
            )
            .order_by("day")
        )
        by_day = [
            {
                "date": row["day"].isoformat() if row["day"] else None,
                "dispense_events": row["events"],
                "total_quantity": _dec_to_float(row["quantity"]),
                "prescriptions": row["prescriptions"],
            }
            for row in daily
            if row["day"]
        ]

        weekly = (
            Dispense.objects.filter(dispensed_at__gte=start_dt, dispensed_at__lte=end_dt)
            .annotate(w=TruncWeek("dispensed_at"))
            .values("w")
            .annotate(events=Count("id"), quantity=Sum("quantity"), rx=Count("prescription_id", distinct=True))
            .order_by("w")
        )
        by_week = [
            {
                "week": row["w"].strftime("%Y-%m-%d") if row["w"] else None,  # ISO week start date
                "dispense_events": row["events"],
                "total_quantity": _dec_to_float(row["quantity"]),
                "prescriptions": row["rx"],
            }
            for row in weekly
            if row["w"]
        ]

        monthly = (
            Dispense.objects.filter(dispensed_at__gte=start_dt, dispensed_at__lte=end_dt)
            .annotate(m=TruncMonth("dispensed_at"))
            .values("m")
            .annotate(events=Count("id"), quantity=Sum("quantity"), rx=Count("prescription_id", distinct=True))
            .order_by("m")
        )
        by_month = [
            {
                "month": row["m"].strftime("%Y-%m") if row["m"] else None,
                "dispense_events": row["events"],
                "total_quantity": _dec_to_float(row["quantity"]),
                "prescriptions": row["rx"],
            }
            for row in monthly
            if row["m"]
        ]

        quarterly = (
            Dispense.objects.filter(dispensed_at__gte=start_dt, dispensed_at__lte=end_dt)
            .annotate(q=TruncQuarter("dispensed_at"))
            .values("q")
            .annotate(events=Count("id"), quantity=Sum("quantity"), rx=Count("prescription_id", distinct=True))
            .order_by("q")
        )
        by_quarter = [
            {
                "quarter": row["q"].strftime("%Y-Q") + str((row["q"].month - 1) // 3 + 1) if row["q"] else None,
                "dispense_events": row["events"],
                "total_quantity": _dec_to_float(row["quantity"]),
                "prescriptions": row["rx"],
            }
            for row in quarterly
            if row["q"]
        ]

        # For bimonthly, group by year and bimonth (1-2, 3-4, 5-6, 7-8, 9-10, 11-12)
        bimonthly = (
            Dispense.objects.filter(dispensed_at__gte=start_dt, dispensed_at__lte=end_dt)
            .annotate(
                year=ExtractYear("dispensed_at"),
                bimonth=Case(
                    When(dispensed_at__month__in=[1, 2], then=Value(1)),
                    When(dispensed_at__month__in=[3, 4], then=Value(2)),
                    When(dispensed_at__month__in=[5, 6], then=Value(3)),
                    When(dispensed_at__month__in=[7, 8], then=Value(4)),
                    When(dispensed_at__month__in=[9, 10], then=Value(5)),
                    When(dispensed_at__month__in=[11, 12], then=Value(6)),
                    output_field=IntegerField()
                )
            )
            .values("year", "bimonth")
            .annotate(events=Count("id"), quantity=Sum("quantity"), rx=Count("prescription_id", distinct=True))
            .order_by("year", "bimonth")
        )
        by_bimonth = [
            {
                "bimonth": f"{row['year']}-B{row['bimonth']}",
                "dispense_events": row["events"],
                "total_quantity": _dec_to_float(row["quantity"]),
                "prescriptions": row["rx"],
            }
            for row in bimonthly
        ]

        # For half-yearly, group by year and half (H1 or H2)
        halfyearly = (
            Dispense.objects.filter(dispensed_at__gte=start_dt, dispensed_at__lte=end_dt)
            .annotate(
                year=ExtractYear("dispensed_at"),
                half=Case(
                    When(dispensed_at__month__lte=6, then=Value('H1')),
                    default=Value('H2'),
                    output_field=CharField()
                )
            )
            .values("year", "half")
            .annotate(events=Count("id"), quantity=Sum("quantity"), rx=Count("prescription_id", distinct=True))
            .order_by("year", "half")
        )
        by_halfyear = [
            {
                "halfyear": f"{row['year']}-{row['half']}",
                "dispense_events": row["events"],
                "total_quantity": _dec_to_float(row["quantity"]),
                "prescriptions": row["rx"],
            }
            for row in halfyearly
        ]

        top_medications = list(
            disp_qs.values("medication_id", "medication__name")
            .annotate(
                dispense_events=Count("id"),
                total_quantity=Sum("quantity"),
            )
            .order_by("-total_quantity")[:25]
        )

        top_by_events = list(
            disp_qs.values("medication_id", "medication__name")
            .annotate(events=Count("id"))
            .order_by("-events")[:15]
        )

        rx_written = Prescription.objects.filter(
            prescribed_at__gte=start_dt, prescribed_at__lte=end_dt
        ).exclude(status="cancelled")
        new_prescriptions = rx_written.count()
        rx_by_status = {
            r["status"]: r["c"]
            for r in rx_written.values("status").annotate(c=Count("id")).order_by("-c")
        }

        hod_qs = HodStockIssue.objects.filter(
            issued_at__gte=start_dt, issued_at__lte=end_dt
        ).select_related("medication")
        hod_issue_events = hod_qs.count()
        hod_agg = hod_qs.aggregate(total_qty=Sum("quantity"))
        hod_total_quantity = _dec_to_float(hod_agg["total_qty"])
        hod_top_medications = list(
            hod_qs.values("medication_id", "medication__name")
            .annotate(
                issue_events=Count("id"),
                total_quantity=Sum("quantity"),
            )
            .order_by("-total_quantity")[:15]
        )
        hod_by_day = [
            {
                "date": row["day"].isoformat() if row["day"] else None,
                "issue_events": row["events"],
                "total_quantity": _dec_to_float(row["quantity"]),
            }
            for row in (
                hod_qs.annotate(day=TruncDate("issued_at"))
                .values("day")
                .annotate(events=Count("id"), quantity=Sum("quantity"))
                .order_by("day")
            )
        ]

        report = {
                "period": {
                    "start": start_dt.date().isoformat(),
                    "end": end_dt.date().isoformat(),
                },
                "dispensing": {
                    "dispense_events": dispense_events,
                    "total_quantity_all_units": total_quantity,
                    "note": "Total quantity sums raw dispense amounts; units may differ between items.",
                    "prescriptions_with_activity": prescriptions_touched,
                    "unique_patients": unique_patients_dispensed,
                },
                "prescribing": {
                    "new_prescriptions": new_prescriptions,
                    "by_status": rx_by_status,
                },
                "hod_store": {
                    "issue_events": hod_issue_events,
                    "total_quantity_all_units": hod_total_quantity,
                    "note": "HOD store discretionary issues (not prescription dispensing).",
                    "by_day": hod_by_day,
                    "top_medications_by_quantity": [
                        {
                            "medication_id": r["medication_id"],
                            "name": r["medication__name"],
                            "issue_events": r["issue_events"],
                            "total_quantity": _dec_to_float(r["total_quantity"]),
                        }
                        for r in hod_top_medications
                    ],
                },
                "patients_by_gender": gender,
                "patients_by_category": category,
                "npa_staff_linked_vs_non_npa": staff_split,
                "by_day": by_day,
                "by_week": by_week,
                "by_month": by_month,
                "by_bimonth": by_bimonth,
                "by_quarter": by_quarter,
                "by_halfyear": by_halfyear,
                "top_medications_by_quantity": [
                    {
                        "medication_id": r["medication_id"],
                        "name": r["medication__name"],
                        "dispense_events": r["dispense_events"],
                        "total_quantity": _dec_to_float(r["total_quantity"]),
                    }
                    for r in top_medications
                ],
                "top_medications_by_events": [
                    {
                        "medication_id": r["medication_id"],
                        "name": r["medication__name"],
                        "dispense_events": r["events"],
                    }
                    for r in top_by_events
                ],
            }
        exported = maybe_export_analytics(request, report, module_key="pharmacy")
        if exported is not None:
            return exported
        return Response(report)
