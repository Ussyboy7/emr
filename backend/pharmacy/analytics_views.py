"""Pharmacy module analytics (dispensing & prescribing patterns)."""
from decimal import Decimal

from django.db.models import Count, Sum
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
from pharmacy.models import Dispense, Prescription


def _dec_to_float(d) -> float:
    if d is None:
        return 0.0
    if isinstance(d, Decimal):
        return float(d)
    return float(d)


class PharmacyAnalyticsSummaryView(APIView):
    """
    GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
    Dispensing metrics use Dispense.dispensed_at.
    Prescribing volume uses Prescription.prescribed_at.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        parsed = parse_analytics_dates(request)
        if isinstance(parsed, Response):
            return parsed
        start_dt, end_dt = parsed

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

        return Response(
            {
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
                "patients_by_gender": gender,
                "patients_by_category": category,
                "npa_staff_linked_vs_non_npa": staff_split,
                "by_day": by_day,
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
        )
