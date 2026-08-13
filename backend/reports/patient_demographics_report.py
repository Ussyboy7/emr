"""Patient register demographics — full active register or registrations in period."""
from __future__ import annotations

from datetime import date

from django.db.models import Q, Value
from django.db.models.functions import ExtractYear
from django.utils import timezone

from patients.models import Patient

MR_PATIENT_CATEGORY_ROWS: list[tuple[int, str, Q]] = [
    (1, "Officers", Q(category="employee", employee_type__icontains="officer")),
    (2, "Staff", Q(category="employee") & ~Q(employee_type__icontains="officer")),
    (
        3,
        "Employee Dependents",
        Q(category="dependent") & ~Q(dependent_type__icontains="retiree"),
    ),
    (4, "Retirees", Q(category="retiree")),
    (5, "Retiree Dependents", Q(category="dependent", dependent_type__icontains="retiree")),
    (6, "Non-NPA", Q(category="nonnpa")),
]

GENDER_ROWS = [
    ("male", "Male"),
    ("female", "Female"),
    ("other", "Other"),
]

AGE_ROWS = [
    ("0-18", Q(age__gte=0, age__lte=18)),
    ("19-35", Q(age__gte=19, age__lte=35)),
    ("36-50", Q(age__gte=36, age__lte=50)),
    ("51-65", Q(age__gte=51, age__lte=65)),
    ("65+", Q(age__gt=65)),
]


def _pct(count: int, total: int) -> float:
    return round((count / total * 100) if total > 0 else 0, 1)


def _patient_cohort(*, all_time: bool, period_start: date, period_end: date):
    base = Patient.objects.filter(is_active=True)
    if all_time:
        return base, "active_register"
    return base.filter(
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    ), "registered_in_period"


def build_patient_demographics_report(
    period_start: date,
    period_end: date,
    *,
    all_time: bool,
) -> dict:
    today = timezone.localdate()
    cohort, cohort_mode = _patient_cohort(
        all_time=all_time,
        period_start=period_start,
        period_end=period_end,
    )
    total = cohort.count()

    category_breakdown = []
    categorized = Q()
    for sn, label, filt in MR_PATIENT_CATEGORY_ROWS:
        categorized |= filt
        count = cohort.filter(filt).count()
        category_breakdown.append(
            {"sn": sn, "category": label, "count": count, "percentage": _pct(count, total)}
        )

    other_count = cohort.exclude(categorized).count()
    if other_count > 0:
        category_breakdown.append(
            {
                "sn": len(category_breakdown) + 1,
                "category": "Other",
                "count": other_count,
                "percentage": _pct(other_count, total),
            }
        )

    employees = cohort.filter(category="employee").count()
    non_employees = total - employees
    male = cohort.filter(gender="male").count()
    female = cohort.filter(gender="female").count()

    gender_breakdown = []
    for key, label in GENDER_ROWS:
        count = cohort.filter(gender=key).count()
        if count > 0:
            gender_breakdown.append(
                {"key": key, "label": label, "count": count, "percentage": _pct(count, total)}
            )
    gender_unknown = total - male - female - cohort.filter(gender="other").count()
    if gender_unknown > 0:
        gender_breakdown.append(
            {
                "key": "unknown",
                "label": "Not recorded",
                "count": gender_unknown,
                "percentage": _pct(gender_unknown, total),
            }
        )

    aged = cohort.annotate(age=ExtractYear(Value(today)) - ExtractYear("date_of_birth"))
    age_breakdown = []
    age_assigned = 0
    for key, filt in AGE_ROWS:
        count = aged.filter(filt).count()
        age_assigned += count
        age_breakdown.append(
            {"key": key, "label": key.replace("-", "–"), "count": count, "percentage": _pct(count, total)}
        )
    age_unknown = total - age_assigned
    if age_unknown > 0:
        age_breakdown.append(
            {
                "key": "unknown",
                "label": "Unknown",
                "count": age_unknown,
                "percentage": _pct(age_unknown, total),
            }
        )

    blood_breakdown = []
    recorded_blood = 0
    for bg, _ in Patient.BLOOD_GROUP_CHOICES:
        count = cohort.filter(blood_group=bg).count()
        if count > 0:
            recorded_blood += count
            blood_breakdown.append({"label": bg, "count": count, "percentage": _pct(count, total)})
    not_recorded_blood = total - recorded_blood
    if not_recorded_blood > 0:
        blood_breakdown.append(
            {
                "label": "Not recorded",
                "count": not_recorded_blood,
                "percentage": _pct(not_recorded_blood, total),
            }
        )

    legacy_by_category = {
        choice: cohort.filter(category=choice).count() for choice, _ in Patient.CATEGORY_CHOICES
    }

    return {
        "cohort_mode": cohort_mode,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "summary": {
            "total_patients": total,
            "total_employees": employees,
            "total_non_employees": non_employees,
            "total_male": male,
            "total_female": female,
            "blood_group_recorded": recorded_blood,
        },
        "category_breakdown": category_breakdown,
        "gender_breakdown": gender_breakdown,
        "age_breakdown": age_breakdown,
        "blood_group_breakdown": blood_breakdown,
        "by_category": legacy_by_category,
        "by_gender": {g: cohort.filter(gender=g).count() for g, _ in Patient.GENDER_CHOICES},
        "by_age_group": {row["key"]: row["count"] for row in age_breakdown if row["key"] != "unknown"},
        "by_blood_group": {bg: cohort.filter(blood_group=bg).count() for bg, _ in Patient.BLOOD_GROUP_CHOICES},
        "total_patients": total,
    }
