"""Radiology study volumes by modality for MR radiological services report."""
from __future__ import annotations

from datetime import date

from django.db.models import DateField, OuterRef, Q, Subquery

from patients.models import Patient
from radiology.models import RadiologyStudy

MODALITY_ROW_DEFS: list[tuple[str, Q]] = [
    (
        "X-Ray",
        Q(modality__icontains="x-ray")
        | Q(modality__icontains="xray")
        | Q(procedure__icontains="x-ray"),
    ),
    (
        "ECG",
        Q(modality__icontains="ecg")
        | Q(procedure__icontains="ecg")
        | Q(procedure__icontains="electrocardiogram"),
    ),
    (
        "Ultrasound",
        Q(modality__icontains="ultrasound") | Q(procedure__icontains="ultrasound"),
    ),
    (
        "CT Scan",
        Q(modality__icontains="computed tomography")
        | Q(procedure__icontains="ct scan")
        | Q(modality__iregex=r"(^|[^a-z])ct([^a-z]|$)")
        | Q(procedure__iregex=r"(^|[^a-z])ct([^a-z]|$)"),
    ),
    (
        "MRI",
        Q(modality__icontains="mri")
        | Q(procedure__icontains="magnetic resonance"),
    ),
]


def _known_modality_q() -> Q:
    combined = Q()
    for _, filt in MODALITY_ROW_DEFS:
        combined |= filt
    return combined


def _study_gender_counts(studies_qs, filt: Q) -> tuple[int, int, int]:
    qs = studies_qs.filter(filt)
    male = qs.filter(order__patient__gender="male").count()
    female = qs.filter(order__patient__gender="female").count()
    return male, female, qs.count()


def build_radiological_report(period_start: date, period_end: date) -> dict:
    history_studies = RadiologyStudy.objects.filter(
        order__patient__isnull=False
    ).select_related("order__patient")
    studies = history_studies.filter(
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    )
    total = studies.count()

    categories = []
    total_male = total_female = 0
    for label, filt in MODALITY_ROW_DEFS:
        male, female, count = _study_gender_counts(studies, filt)
        if count > 0:
            total_male += male
            total_female += female
            categories.append(
                {
                    "category": label,
                    "count": count,
                    "male": male,
                    "female": female,
                    "percentage": round((count / total * 100) if total > 0 else 0, 1),
                }
            )

    other_male, other_female, other_count = _study_gender_counts(
        studies, ~_known_modality_q()
    )
    if other_count > 0:
        total_male += other_male
        total_female += other_female
        categories.append(
            {
                "category": "Other",
                "count": other_count,
                "male": other_male,
                "female": other_female,
                "percentage": round((other_count / total * 100) if total > 0 else 0, 1),
            }
        )

    for sn, row in enumerate(categories, start=1):
        row["sn"] = sn

    patient_ids = set(
        studies.values_list("order__patient_id", flat=True).distinct()
    )
    patient_ids.discard(None)
    total_seen = len(patient_ids)

    first_time_patients = 0
    returning_patients = 0
    if period_start and period_end and patient_ids:
        first_study_date_subquery = history_studies.filter(
            order__patient=OuterRef("pk")
        ).order_by("created_at", "id").values("created_at__date")[:1]
        patients_qs = Patient.objects.filter(id__in=patient_ids).annotate(
            first_study_date=Subquery(first_study_date_subquery, output_field=DateField())
        )
        first_time_patients = patients_qs.filter(
            first_study_date__gte=period_start,
            first_study_date__lte=period_end,
        ).count()
        returning_patients = max(patients_qs.count() - first_time_patients, 0)

    return {
        "data": categories,
        "summary": {
            "grand_total": total,
            "total_male": total_male,
            "total_female": total_female,
            "first_time_patients": first_time_patients,
            "returning_patients": returning_patients,
            "total_unique_patients_seen": total_seen,
            "total_studies": total,
        },
    }
