"""Laboratory attendance — distinct patients with lab orders by MR category."""
from __future__ import annotations

from datetime import date

from django.db.models import DateField, OuterRef, Q, Subquery

from common.report_period import inclusive_date_bounds
from laboratory.models import LabOrder
from patients.models import Patient
from reports.attendance_statistics import (
    distinct_patient_gender_counts_for_filter,
    mr_categorized_patients_q,
    mr_category_row_filters,
)


def medical_exam_lab_orders_filter(period_start: date, period_end: date) -> Q:
    """
    Lab orders tied to medical examination workflows in the EMR.

    - Annual check-up visits (programme medical exam)
    - Employment medical certificates issued in the same period
    - Explicit clinical notes / test names mentioning medical exam
    """
    cert_start, cert_end = inclusive_date_bounds(period_start, period_end)
    return (
        Q(visit__visit_type="annual_checkup")
        | Q(visit__annual_checkup__isnull=False)
        | Q(clinical_notes__icontains="medical exam")
        | Q(tests__name__icontains="medical exam")
        | Q(tests__name__icontains="pre-employment")
        | Q(tests__name__icontains="employment medical")
        | Q(
            patient__medical_certificates__purpose="employment",
            patient__medical_certificates__issued_at__gte=cert_start,
            patient__medical_certificates__issued_at__lt=cert_end,
        )
    )


def build_lab_attendance_report(period_start: date, period_end: date, org_facility_id: int | None = None) -> dict:
    from common.report_period import filter_inclusive_date_range

    history_orders = LabOrder.objects.filter(patient__isnull=False)
    if org_facility_id is not None:
        history_orders = history_orders.filter(location_clinic_id=org_facility_id)
    history_orders = history_orders.select_related("patient").distinct()
    lab_orders = filter_inclusive_date_range(
        history_orders, "ordered_at", period_start, period_end
    )

    grand_total = lab_orders.values("patient").distinct().count()
    data = []
    total_male = total_female = 0
    officers_total = staff_total = 0
    total_non_employee = 0

    for sn, label, filt in mr_category_row_filters():
        male, female, total = distinct_patient_gender_counts_for_filter(lab_orders, filt)
        total_male += male
        total_female += female
        if sn <= 2:
            officers_total += total if sn == 1 else 0
            staff_total += total if sn == 2 else 0
        else:
            total_non_employee += total
        data.append(
            {
                "sn": sn,
                "category": label,
                "male": male,
                "female": female,
                "total": total,
                "percentage": round((total / grand_total * 100) if grand_total > 0 else 0, 1),
            }
        )

    other_male, other_female, other_total = distinct_patient_gender_counts_for_filter(
        lab_orders, ~mr_categorized_patients_q()
    )
    if other_total > 0:
        total_male += other_male
        total_female += other_female
        total_non_employee += other_total
        data.append(
            {
                "sn": len(data) + 1,
                "category": "Other",
                "male": other_male,
                "female": other_female,
                "total": other_total,
                "percentage": round((other_total / grand_total * 100) if grand_total > 0 else 0, 1),
            }
        )

    medical_exam_orders = lab_orders.filter(
        medical_exam_lab_orders_filter(period_start, period_end)
    ).distinct()
    med_male, med_female, med_total = distinct_patient_gender_counts_for_filter(
        medical_exam_orders, Q()
    )
    data.append(
        {
            "sn": len(data) + 1,
            "category": "Medical Exam",
            "male": med_male,
            "female": med_female,
            "total": med_total,
            "percentage": round((med_total / grand_total * 100) if grand_total > 0 else 0, 1),
            "source": "annual_checkup_visit_or_employment_medical",
        }
    )

    total_employee = officers_total + staff_total
    unique_patient_ids = set(lab_orders.values_list("patient_id", flat=True).distinct())

    first_time_patients = 0
    returning_patients = 0
    if period_start and period_end and unique_patient_ids:
        first_lab_qs = LabOrder.objects.filter(patient__isnull=False, patient=OuterRef("pk"))
        if org_facility_id is not None:
            first_lab_qs = first_lab_qs.filter(location_clinic_id=org_facility_id)
        first_lab_date_subquery = (
            first_lab_qs.order_by("ordered_at", "id").values("ordered_at__date")[:1]
        )
        patients_qs = Patient.objects.filter(id__in=unique_patient_ids).annotate(
            first_lab_order_date=Subquery(first_lab_date_subquery, output_field=DateField())
        )
        first_time_patients = patients_qs.filter(
            first_lab_order_date__gte=period_start,
            first_lab_order_date__lte=period_end,
        ).count()
        returning_patients = max(patients_qs.count() - first_time_patients, 0)

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "data": data,
        "summary": {
            "total_employee": total_employee,
            "total_non_employee": total_non_employee,
            "total_male": total_male,
            "total_female": total_female,
            "grand_total": grand_total,
            "medical_exam_total": med_total,
            "first_time_patients": first_time_patients,
            "returning_patients": returning_patients,
            "total_unique_patients_seen": grand_total,
            "total_lab_orders": lab_orders.count(),
        },
    }
