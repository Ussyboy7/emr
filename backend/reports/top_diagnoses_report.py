"""Top ICD-10 diagnoses ranking from completed consultations."""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from django.db.models import Count, F, Q

from consultation.models import Diagnosis
from reports.icd10_families import resolve_family_range


def build_top_diagnoses_report(
    period_start: date,
    period_end: date,
    *,
    limit: int | None = 20,
    page: int | None = None,
    page_size: int | None = None,
    org_facility_id: int | None = None,
    search: str | None = None,
    group_by: str | None = None,
) -> dict:
    if limit is not None:
        limit = max(1, min(int(limit), 1000))
    if page is not None:
        page = max(1, int(page))
    if page_size is not None:
        page_size = max(1, min(int(page_size), 100))

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
        .order_by("-count", "code")
    )

    if group_by == "family":
        families: dict[str, dict] = defaultdict(
            lambda: {"label": "", "range_start": "", "range_end": "", "count": 0, "codes": set()}
        )
        for row in aggregated:
            code = row["code"] or "UNSPECIFIED"
            description = row.get("description") or ""
            label, range_start, range_end = resolve_family_range(code)
            entry = families[label]
            entry["label"] = label
            entry["range_start"] = range_start
            entry["range_end"] = range_end
            entry["count"] += row["count"]
            entry["codes"].add(f"{code} — {description}" if description else code)
        ranked = sorted(
            families.values(),
            key=lambda e: (-e["count"], e["label"]),
        )
        if limit is not None:
            ranked = ranked[:limit]
        results = []
        for entry in ranked:
            range_start, range_end = entry["range_start"], entry["range_end"]
            code = (
                f"{range_start}–{range_end}" if range_start and range_end and range_start != range_end
                else range_start
            )
            results.append(
                {
                    "diagnosis": entry["label"],
                    "code": code,
                    "description": entry["label"],
                    "count": entry["count"],
                    "codes": sorted(entry["codes"]),
                    "codes_count": len(entry["codes"]),
                    "percentage": round((entry["count"] / total_lines * 100) if total_lines > 0 else 0, 1),
                }
            )
        total_ranking_count = len(results)
        if page is not None and page_size is not None:
            start = (page - 1) * page_size
            end = start + page_size
            paginated = results[start:end]
        else:
            paginated = results
        return {
            "data": paginated,
            "summary": {
                "total_diagnosis_lines": total_lines,
                "distinct_icd10_codes": distinct_codes,
                "ranking_count": total_ranking_count,
                "limit": limit,
                "page": page,
                "page_size": page_size,
                "group_by": "family",
                "grand_total": total_lines,
            },
        }

    results = []
    rows_iter = aggregated[:limit] if limit is not None else aggregated
    for row in rows_iter:
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

    total_ranking_count = len(results)
    if page is not None and page_size is not None:
        start = (page - 1) * page_size
        end = start + page_size
        paginated = results[start:end]
    else:
        paginated = results
    return {
        "data": paginated,
        "summary": {
            "total_diagnosis_lines": total_lines,
            "distinct_icd10_codes": distinct_codes,
            "ranking_count": total_ranking_count,
            "limit": limit,
            "page": page,
            "page_size": page_size,
            "group_by": "code",
            "grand_total": total_lines,
        },
    }
