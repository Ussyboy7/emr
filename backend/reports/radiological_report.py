"""Radiology study volumes by modality and location for MR radiological services report."""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from django.db.models import DateField, OuterRef, Subquery

from common.order_location import order_location_clinic_name
from patients.models import Patient
from radiology.constants import LEGACY_OTHER_MODALITY_LABEL, OTHER_MODALITY_LABEL
from radiology.models import RadiologyStudy


def _study_location(study: RadiologyStudy) -> str:
    """Resolve clinic/location label — matches radiology order display where possible."""
    order = study.order
    if order is None:
        return "Unspecified"
    name = order_location_clinic_name(order)
    if name and name.strip():
        return name.strip()
    processing = getattr(order, "processing_clinic", None)
    if processing is not None and (processing.name or "").strip():
        return processing.name.strip()
    legacy = (getattr(order, "clinic", None) or "").strip()
    if legacy:
        return legacy
    return "Unspecified"


def _study_modality(study: RadiologyStudy) -> str:
    """Report modality bucket — one row per modality + location, not per procedure."""
    modality = (study.modality or "").strip()
    if modality.lower() == LEGACY_OTHER_MODALITY_LABEL.lower():
        return OTHER_MODALITY_LABEL
    if modality.lower() == OTHER_MODALITY_LABEL.lower():
        return OTHER_MODALITY_LABEL
    if modality:
        return modality
    procedure = (study.procedure or "").strip()
    if procedure.lower() == LEGACY_OTHER_MODALITY_LABEL.lower():
        return OTHER_MODALITY_LABEL
    return procedure or "Unspecified"


def build_radiological_report(period_start: date, period_end: date, org_facility_id: int | None = None) -> dict:
    history_studies = RadiologyStudy.objects.filter(order__patient__isnull=False)
    if org_facility_id is not None:
        history_studies = history_studies.filter(order__location_clinic_id=org_facility_id)
    history_studies = history_studies.select_related(
        "order__patient",
        "order__location_clinic",
        "order__processing_clinic",
        "order__consultation_session__location_clinic",
        "order__visit__location_clinic",
    )
    studies = history_studies.filter(
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    )
    total = studies.count()

    buckets: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"count": 0, "male": 0, "female": 0}
    )
    for study in studies.iterator():
        modality = _study_modality(study)
        location = _study_location(study)
        key = (modality, location)
        buckets[key]["count"] += 1
        patient = study.order.patient if study.order else None
        gender = getattr(patient, "gender", None)
        if gender == "male":
            buckets[key]["male"] += 1
        elif gender == "female":
            buckets[key]["female"] += 1

    categories = []
    total_male = total_female = 0
    for (modality, location), counts in sorted(
        buckets.items(),
        key=lambda item: (-item[1]["count"], item[0][1], item[0][0]),
    ):
        count = counts["count"]
        male = counts["male"]
        female = counts["female"]
        total_male += male
        total_female += female
        categories.append(
            {
                "modality": modality,
                "location": location,
                "category": f"{modality} — {location}",
                "count": count,
                "male": male,
                "female": female,
                "percentage": round((count / total * 100) if total > 0 else 0, 1),
            }
        )

    for sn, row in enumerate(categories, start=1):
        row["sn"] = sn

    patient_ids = set(studies.values_list("order__patient_id", flat=True).distinct())
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
