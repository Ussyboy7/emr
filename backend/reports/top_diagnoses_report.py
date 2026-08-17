"""Top ICD-10 diagnoses ranking from completed consultations."""
from __future__ import annotations

from datetime import date

from django.db.models import Count, F, Q

from consultation.models import Diagnosis


def build_top_diagnoses_report(
    period_start: date,
    period_end: date,
    *,
    limit: int = 20,
    org_facility_id: int | None = None,
    search: str | None = None,
) -> dict:
    limit = max(1, min(int(limit), 100))

    from common.report_period import filter_inclusive_date_range

    qs = filter_inclusive_date_range(
        Diagnosis.objects.filter(
            session__status="completed",
            icd10_code__isnull=False,
            patient__isnull=False,
        ),
        "session__started_at",
        period_start,
        period_end,
    )
    if org_facility_id is not None:
        qs = qs.filter(visit__location_clinic_id=org_facility_id)
    if search:
        qs = qs.filter(
            Q(icd10_code__code__icontains=search)
            | Q(icd10_code__description__icontains=search)
        )

    total_lines = qs.count()
    distinct_codes = (
        qs.values(code=F("icd10_code__code")).distinct().count()
    )

    aggregated = (
        qs.values(
            code=F("icd10_code__code"),
            description=F("icd10_code__description"),
        )
        .annotate(count=Count("id"))
        .order_by("-count", "code")[:limit]
    )

    results = []
    for row in aggregated:
        code = row.get("code") or "UNSPECIFIED"
        description = row.get("description") or ""
        count = row.get("count") or 0
        results.append(
            {
                "diagnosis": f"{code} - {description}" if description else code,
                "code": code,
                "description": description,
                "count": count,
                "percentage": round((count / total_lines * 100) if total_lines > 0 else 0, 1),
            }
        )

    return {
        "data": results,
        "summary": {
            "total_diagnosis_lines": total_lines,
            "distinct_icd10_codes": distinct_codes,
            "ranking_count": len(results),
            "limit": limit,
            "grand_total": total_lines,
        },
    }
