"""ICD-10 disease pattern — one row per code + description from completed consultations."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Count, F, Q

from consultation.models import Diagnosis
from reports.icd10_families import resolve_family_range
from reports.icd_diagnosis_aggregation import merge_icd_period_reports

EMPLOYEE_CATEGORY_Q = Q(patient__category="employee")
NON_EMPLOYEE_CATEGORY_Q = ~Q(patient__category="employee")


def _diagnosis_qs(
    period_start: date,
    period_end: date,
    org_facility_id: int | None = None,
    search: str | None = None,
):
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
    return qs


def build_disease_pattern_report(
    period_start: date,
    period_end: date,
    *,
    limit: int | None = None,
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

    diagnosis_qs = _diagnosis_qs(
        period_start, period_end, org_facility_id=org_facility_id, search=search
    )
    diagnosis_rows = (
        diagnosis_qs.values(
            code=F("icd10_code__code"),
            description=F("icd10_code__description"),
        )
        .annotate(
            employee=Count("id", filter=EMPLOYEE_CATEGORY_Q),
            non_employee=Count("id", filter=NON_EMPLOYEE_CATEGORY_Q),
            male=Count("id", filter=Q(patient__gender="male")),
            female=Count("id", filter=Q(patient__gender="female")),
        )
        .annotate(total=F("employee") + F("non_employee"))
        .order_by("-total", "code")
    )

    all_rows = []
    for idx, row in enumerate(diagnosis_rows, start=1):
        code = (row.get("code") or "").strip()
        description = (row.get("description") or "").strip()
        male = row.get("male", 0) or 0
        female = row.get("female", 0) or 0
        total = row.get("total", 0) or 0
        all_rows.append(
            {
                "sn": idx,
                "code": code or "—",
                "description": description or "—",
                "diagnosis": f"{code} — {description}" if code and description else code or description,
                "employee": row.get("employee", 0) or 0,
                "non_employee": row.get("non_employee", 0) or 0,
                "male": male,
                "female": female,
                "total": total,
            }
        )

    grand_total = sum(item["total"] for item in all_rows)
    for item in all_rows:
        item["percentage"] = round((item["total"] / grand_total * 100) if grand_total > 0 else 0, 1)

    result = all_rows[:limit] if limit is not None else all_rows

    if group_by == "family":
        families: dict[str, dict] = defaultdict(
            lambda: {
                "label": "",
                "range_start": "",
                "range_end": "",
                "employee": 0,
                "non_employee": 0,
                "male": 0,
                "female": 0,
                "total": 0,
                "codes": set(),
            }
        )
        for item in all_rows:
            code = item.get("code") or "—"
            label, range_start, range_end = resolve_family_range(code)
            entry = families[label]
            entry["label"] = label
            entry["range_start"] = range_start
            entry["range_end"] = range_end
            entry["employee"] += item["employee"]
            entry["non_employee"] += item["non_employee"]
            entry["male"] += item["male"]
            entry["female"] += item["female"]
            entry["total"] += item["total"]
            entry["codes"].add(code)
        family_rows = []
        for idx, entry in enumerate(
            sorted(families.values(), key=lambda e: (-e["total"], e["label"])),
            start=1,
        ):
            range_start, range_end = entry["range_start"], entry["range_end"]
            code = (
                f"{range_start}–{range_end}"
                if range_start and range_end and range_start != range_end
                else range_start or "—"
            )
            family_rows.append(
                {
                    "sn": idx,
                    "code": code,
                    "description": entry["label"],
                    "diagnosis": entry["label"],
                    "employee": entry["employee"],
                    "non_employee": entry["non_employee"],
                    "male": entry["male"],
                    "female": entry["female"],
                    "total": entry["total"],
                    "codes": sorted(entry["codes"]),
                    "codes_count": len(entry["codes"]),
                    "percentage": round((entry["total"] / grand_total * 100) if grand_total > 0 else 0, 1),
                }
            )
        result = family_rows[:limit] if limit is not None else family_rows

    # Backend pagination
    total_ranking_count = len(result)
    if page is not None and page_size is not None:
        start = (page - 1) * page_size
        end = start + page_size
        paginated_result = result[start:end]
    else:
        paginated_result = result

    return {
        "mode": "icd10",
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "data": paginated_result,
        "summary": {
            "total_diagnosis_lines": grand_total,
            "distinct_icd10_codes": len(all_rows),
            "total_employee": sum(item["employee"] for item in all_rows),
            "total_non_employee": sum(item["non_employee"] for item in all_rows),
            "total_male": sum(item["male"] for item in all_rows),
            "total_female": sum(item["female"] for item in all_rows),
            "ranking_count": total_ranking_count,
            "limit": limit,
            "page": page,
            "page_size": page_size,
            "group_by": "family" if group_by == "family" else "code",
            "grand_total": grand_total,
        },
    }


def build_disease_pattern_compared_report(
    period_start: date,
    period_end: date,
    *,
    periods: int = 3,
    limit: int | None = None,
    page: int | None = None,
    page_size: int | None = None,
    org_facility_id: int | None = None,
    search: str | None = None,
) -> dict:
    """ICD-10 codes compared across N consecutive periods ending at period_end."""
    if limit is not None:
        limit = max(1, min(int(limit), 1000))
    if page is not None:
        page = max(1, int(page))
    if page_size is not None:
        page_size = max(1, min(int(page_size), 100))
    length_days = (period_end - period_start).days + 1
    period_slices: list[tuple[date, date, str]] = []
    end = period_end
    for _ in range(periods):
        start = end - timedelta(days=length_days - 1)
        label = end.strftime("%b %Y").upper()
        period_slices.insert(0, (start, end, label))
        end = start - timedelta(days=1)

    period_reports = [
        build_disease_pattern_report(
            p_start, p_end, limit=limit, org_facility_id=org_facility_id, search=search
        )
        for p_start, p_end, _ in period_slices
    ]
    period_labels = [label for _, _, label in period_slices]
    rows = merge_icd_period_reports(period_slices, period_reports)
    if limit is not None:
        rows = rows[:limit]
    total_count = len(rows)
    if page is not None and page_size is not None:
        start = (page - 1) * page_size
        end = start + page_size
        paginated = rows[start:end]
    else:
        paginated = rows

    return {
        "mode": "icd10_compared",
        "period_labels": period_labels,
        "data": paginated,
        "summary": {
            "distinct_icd10_codes": total_count,
            "ranking_count": total_count,
            "page": page,
            "page_size": page_size,
            "periods": [
                {
                    "label": label,
                    "period_start": p_start.isoformat(),
                    "period_end": p_end.isoformat(),
                    "grand_total": report["summary"]["grand_total"],
                }
                for (p_start, p_end, label), report in zip(period_slices, period_reports)
            ],
        },
    }
