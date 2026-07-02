"""ICD-10 disease pattern — one row per code + description from completed consultations."""
from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Count, F, Q

from consultation.models import Diagnosis
from reports.icd_diagnosis_aggregation import merge_icd_period_reports

EMPLOYEE_CATEGORY_Q = Q(patient__category="employee")
NON_EMPLOYEE_CATEGORY_Q = ~Q(patient__category="employee")


def _diagnosis_qs(period_start: date, period_end: date):
    return Diagnosis.objects.filter(
        session__status="completed",
        icd10_code__isnull=False,
        patient__isnull=False,
        session__started_at__date__gte=period_start,
        session__started_at__date__lte=period_end,
    )


def build_disease_pattern_report(period_start: date, period_end: date) -> dict:
    diagnosis_qs = _diagnosis_qs(period_start, period_end)
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

    result = []
    for idx, row in enumerate(diagnosis_rows, start=1):
        code = (row.get("code") or "").strip()
        description = (row.get("description") or "").strip()
        male = row.get("male", 0) or 0
        female = row.get("female", 0) or 0
        total = row.get("total", 0) or 0
        gender_other = max(0, total - male - female)
        result.append(
            {
                "sn": idx,
                "code": code or "—",
                "description": description or "—",
                "diagnosis": f"{code} — {description}" if code and description else code or description,
                "employee": row.get("employee", 0) or 0,
                "non_employee": row.get("non_employee", 0) or 0,
                "male": male,
                "female": female,
                "gender_other": gender_other,
                "total": total,
            }
        )

    grand_total = sum(item["total"] for item in result)
    for item in result:
        item["percentage"] = round((item["total"] / grand_total * 100) if grand_total > 0 else 0, 1)

    return {
        "mode": "icd10",
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "data": result,
        "summary": {
            "total_diagnosis_lines": grand_total,
            "distinct_icd10_codes": len(result),
            "total_employee": sum(item["employee"] for item in result),
            "total_non_employee": sum(item["non_employee"] for item in result),
            "total_male": sum(item["male"] for item in result),
            "total_female": sum(item["female"] for item in result),
            "total_gender_other": sum(item["gender_other"] for item in result),
            "grand_total": grand_total,
        },
    }


def build_disease_pattern_compared_report(
    period_start: date,
    period_end: date,
    *,
    periods: int = 3,
) -> dict:
    """ICD-10 codes compared across N consecutive periods ending at period_end."""
    length_days = (period_end - period_start).days + 1
    period_slices: list[tuple[date, date, str]] = []
    end = period_end
    for _ in range(periods):
        start = end - timedelta(days=length_days - 1)
        label = end.strftime("%b %Y").upper()
        period_slices.insert(0, (start, end, label))
        end = start - timedelta(days=1)

    period_reports = [
        build_disease_pattern_report(p_start, p_end) for p_start, p_end, _ in period_slices
    ]
    period_labels = [label for _, _, label in period_slices]
    rows = merge_icd_period_reports(period_slices, period_reports)

    return {
        "mode": "icd10_compared",
        "period_labels": period_labels,
        "data": rows,
        "summary": {
            "distinct_icd10_codes": len(rows),
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
