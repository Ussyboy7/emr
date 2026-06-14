"""ICD-10 disease pattern — diagnosis lines by code, category, and gender."""
from __future__ import annotations

from datetime import date

from django.db.models import Count, F, Q

from consultation.models import Diagnosis

EMPLOYEE_CATEGORY_Q = Q(patient__category="employee")
NON_EMPLOYEE_CATEGORY_Q = ~Q(patient__category="employee")


def build_disease_pattern_report(period_start: date, period_end: date) -> dict:
    diagnosis_qs = Diagnosis.objects.filter(
        session__status="completed",
        icd10_code__isnull=False,
        patient__isnull=False,
        session__started_at__date__gte=period_start,
        session__started_at__date__lte=period_end,
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

    result = []
    for idx, row in enumerate(diagnosis_rows, start=1):
        code = row.get("code") or "UNSPECIFIED"
        description = row.get("description") or ""
        male = row.get("male", 0) or 0
        female = row.get("female", 0) or 0
        total = row.get("total", 0) or 0
        gender_other = max(0, total - male - female)
        result.append(
            {
                "sn": idx,
                "diagnosis": f"{code} - {description}" if description else code,
                "code": code,
                "description": description,
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
