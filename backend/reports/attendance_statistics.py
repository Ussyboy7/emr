"""
Attendance statistics matrix — clinic × patient category × gender.

Supports attendance_count (visit×clinic events) and distinct_patients metrics.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Literal

from django.db.models import Exists, OuterRef, Q

from common.clinic_utils import normalize_clinic_name
from organization.models import OutpatientClinicType
from patients.models import Patient, Visit, VitalReading

Metric = Literal["attendance_count", "distinct_patients"]

WEEKEND_ROW_KEY = "weekend_call"
WEEKEND_ROW_LABEL = "Weekend Call"

CATEGORY_KEYS = [
    "staff",
    "officers",
    "employee_dependants",
    "retirees",
    "retiree_dependents",
    "non_npa",
]

CATEGORY_LABELS = {
    "staff": "Staff",
    "officers": "Officers",
    "employee_dependants": "Employee Dependants",
    "retirees": "Retirees",
    "retiree_dependents": "Retiree Dependents",
    "non_npa": "Non NPA",
}

PDF_CLINIC_LABELS = {
    "GOPD": "Gen Out Patient",
    WEEKEND_ROW_KEY: "Week-End Call",
}

GENDERS = ("male", "female")


def get_active_clinic_rows() -> list[dict[str, str]]:
    """Active OPD clinic types in sort order."""
    rows = list(
        OutpatientClinicType.objects.filter(is_active=True).order_by(
            "sort_order", "name"
        )
    )
    return [{"key": r.name, "label": r.name} for r in rows]


def patient_category_bucket(patient: Patient) -> str | None:
    if patient.category == "employee":
        et = (patient.employee_type or "").lower()
        if "officer" in et:
            return "officers"
        return "staff"
    if patient.category == "dependent":
        dt = (patient.dependent_type or "").lower()
        if "retiree" in dt:
            return "retiree_dependents"
        return "employee_dependants"
    if patient.category == "retiree":
        return "retirees"
    if patient.category == "nonnpa":
        return "non_npa"
    return None


def mr_category_row_filters() -> list[tuple[int, str, Q]]:
    """
    Standard MR category rows for report tables.

    ``Q`` objects use the ``patient__`` prefix (related Patient on lab orders, visits, etc.).
    Matches :func:`patient_category_bucket` — dependents default to employee dependants
    unless ``dependent_type`` contains retiree.
    """
    return [
        (1, "Officers", Q(patient__category="employee", patient__employee_type__icontains="officer")),
        (
            2,
            "Staff",
            Q(patient__category="employee") & ~Q(patient__employee_type__icontains="officer"),
        ),
        (
            3,
            "Employee Dependents",
            Q(patient__category="dependent") & ~Q(patient__dependent_type__icontains="retiree"),
        ),
        (
            4,
            "Retiree Dependents",
            Q(patient__category="dependent", patient__dependent_type__icontains="retiree"),
        ),
        (5, "Non-NPA", Q(patient__category="nonnpa")),
        (6, "Retirees", Q(patient__category="retiree")),
    ]


def mr_categorized_patients_q() -> Q:
    """Patients matching any standard MR category bucket."""
    combined = Q()
    for _, _, filt in mr_category_row_filters():
        combined |= filt
    return combined


def distinct_patient_gender_counts_for_filter(base_qs, filt: Q) -> tuple[int, int, int]:
    """Return (male, female, total) distinct patients for ``base_qs.filter(filt)``."""
    qs = base_qs.filter(filt)
    male = qs.filter(patient__gender="male").values("patient").distinct().count()
    female = qs.filter(patient__gender="female").values("patient").distinct().count()
    total = qs.values("patient").distinct().count()
    return male, female, total


def patient_gender_key(patient: Patient) -> str | None:
    g = (patient.gender or "").strip().lower()
    if g in GENDERS:
        return g
    return None


def attendable_visits_queryset():
    vital_exists = VitalReading.objects.filter(visit_id=OuterRef("pk"))
    return Visit.objects.filter(
        Q(status__in=["in_progress", "completed"])
        | (Q(status="cancelled") & Exists(vital_exists))
    ).select_related("patient")


def clinics_for_visit(visit: Visit) -> list[str]:
    completed = visit.completed_clinics or []
    if completed:
        names = [normalize_clinic_name(str(c)) for c in completed if c]
    else:
        raw = visit.clinics or []
        if raw:
            names = [normalize_clinic_name(str(c)) for c in raw if c]
        elif visit.clinic:
            names = [normalize_clinic_name(visit.clinic)]
        else:
            names = []
    return [n for n in names if n]


def _empty_category_cells() -> dict[str, dict[str, int]]:
    return {cat: {"male": 0, "female": 0} for cat in CATEGORY_KEYS}


def _empty_clinic_store(metric: Metric) -> dict:
    if metric == "distinct_patients":
        return {
            cat: {"male": set(), "female": set()} for cat in CATEGORY_KEYS
        }
    return _empty_category_cells()


def _increment(
    store: dict,
    category: str,
    gender: str,
    patient_id: int,
    metric: Metric,
    amount: int = 1,
) -> None:
    if metric == "distinct_patients":
        store[category][gender].add(patient_id)
    else:
        store[category][gender] += amount


def _store_to_counts(store: dict, metric: Metric) -> dict[str, dict[str, int]]:
    out = _empty_category_cells()
    for cat in CATEGORY_KEYS:
        for gender in GENDERS:
            if metric == "distinct_patients":
                out[cat][gender] = len(store[cat][gender])
            else:
                out[cat][gender] = store[cat][gender]
    return out


def _category_row_total(counts: dict[str, dict[str, int]], category: str) -> int:
    return counts[category]["male"] + counts[category]["female"]


def _build_gender_row(
    label: str,
    counts: dict[str, dict[str, int]],
    gender: str | None,
) -> dict[str, Any]:
    if gender in GENDERS:
        cells = {cat: counts[cat][gender] for cat in CATEGORY_KEYS}
        row_total = sum(cells.values())
    else:
        cells = {cat: _category_row_total(counts, cat) for cat in CATEGORY_KEYS}
        row_total = sum(cells.values())
    return {
        "gender": gender or "total",
        "gender_label": label,
        **cells,
        "row_total": row_total,
    }


def build_attendance_statistics(
    *,
    start_date: date,
    end_date: date,
    metric: Metric = "attendance_count",
    clinic_filter: str | None = None,
) -> dict[str, Any]:
    """
    Build the full matrix or a single-clinic slice.

    clinic_filter: canonical clinic name; when set, only that clinic's rows are returned
                   (no weekend row).
    """
    active_clinics = get_active_clinic_rows()
    active_names = {c["key"] for c in active_clinics}
    if clinic_filter:
        clinic_filter = normalize_clinic_name(clinic_filter)
        active_clinics = [c for c in active_clinics if c["key"] == clinic_filter]

    clinic_stores: dict[str, dict] = {
        c["key"]: _empty_clinic_store(metric) for c in active_clinics
    }
    weekend_store = _empty_clinic_store(metric)
    weekend_visits_counted: set[int] = set()

    visits = attendable_visits_queryset().filter(
        date__gte=start_date,
        date__lte=end_date,
    )

    for visit in visits.iterator(chunk_size=500):
        patient = visit.patient
        bucket = patient_category_bucket(patient)
        gender = patient_gender_key(patient)
        if not bucket or not gender:
            continue

        clinic_names = clinics_for_visit(visit)
        for clinic_name in clinic_names:
            if clinic_name not in active_names:
                continue
            if clinic_filter and clinic_name != clinic_filter:
                continue
            _increment(
                clinic_stores[clinic_name],
                bucket,
                gender,
                patient.id,
                metric,
            )

        if clinic_filter:
            continue

        is_weekend = visit.date.weekday() >= 5
        if is_weekend:
            if metric == "distinct_patients":
                _increment(weekend_store, bucket, gender, patient.id, metric)
            elif visit.id not in weekend_visits_counted:
                weekend_visits_counted.add(visit.id)
                _increment(
                    weekend_store,
                    bucket,
                    gender,
                    patient.id,
                    metric,
                )

    clinic_blocks: list[dict[str, Any]] = []
    footer_male = {cat: 0 for cat in CATEGORY_KEYS}
    footer_female = {cat: 0 for cat in CATEGORY_KEYS}

    for clinic in active_clinics:
        key = clinic["key"]
        counts = _store_to_counts(clinic_stores[key], metric)
        rows = [
            _build_gender_row("Male", counts, "male"),
            _build_gender_row("Female", counts, "female"),
            _build_gender_row("Total", counts, None),
        ]
        for cat in CATEGORY_KEYS:
            footer_male[cat] += counts[cat]["male"]
            footer_female[cat] += counts[cat]["female"]
        clinic_blocks.append(
            {
                "key": key,
                "label": clinic["label"],
                "pdf_label": PDF_CLINIC_LABELS.get(key, clinic["label"]),
                "rows": rows,
            }
        )

    if not clinic_filter:
        weekend_counts = _store_to_counts(weekend_store, metric)
        weekend_rows = [
            _build_gender_row("Male", weekend_counts, "male"),
            _build_gender_row("Female", weekend_counts, "female"),
            _build_gender_row("Total", weekend_counts, None),
        ]
        for cat in CATEGORY_KEYS:
            footer_male[cat] += weekend_counts[cat]["male"]
            footer_female[cat] += weekend_counts[cat]["female"]
        clinic_blocks.append(
            {
                "key": WEEKEND_ROW_KEY,
                "label": WEEKEND_ROW_LABEL,
                "pdf_label": PDF_CLINIC_LABELS.get(WEEKEND_ROW_KEY, WEEKEND_ROW_LABEL),
                "rows": weekend_rows,
            }
        )

    footer_total_counts = {
        cat: {
            "male": footer_male[cat],
            "female": footer_female[cat],
            "total": footer_male[cat] + footer_female[cat],
        }
        for cat in CATEGORY_KEYS
    }

    grand_male = sum(footer_male[cat] for cat in CATEGORY_KEYS)
    grand_female = sum(footer_female[cat] for cat in CATEGORY_KEYS)

    return {
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "metric": metric,
        "metric_label": (
            "Attendance count"
            if metric == "attendance_count"
            else "Distinct patients"
        ),
        "clinic_filter": clinic_filter,
        "categories": [
            {"key": k, "label": CATEGORY_LABELS[k]} for k in CATEGORY_KEYS
        ],
        "clinics": clinic_blocks,
        "footer_columns": footer_total_counts,
        "grand_total_male": grand_male,
        "grand_total_female": grand_female,
        "grand_total_all": grand_male + grand_female,
    }


def _fix_footer_rows(report: dict[str, Any]) -> dict[str, Any]:
    """Build proper footer gender rows from footer column aggregates."""
    fc = report["footer_columns"]
    male_row = {
        "gender": "male",
        "gender_label": "TOTAL ATTENDANCE MALE",
        **{cat: fc[cat]["male"] for cat in CATEGORY_KEYS},
        "row_total": report["grand_total_male"],
    }
    female_row = {
        "gender": "female",
        "gender_label": "TOTAL ATTD. FEMALE",
        **{cat: fc[cat]["female"] for cat in CATEGORY_KEYS},
        "row_total": report["grand_total_female"],
    }
    grand_row = {
        "gender": "total",
        "gender_label": "GRAND TOTAL ATTENDANCE MALE & FEMALE",
        **{cat: fc[cat]["total"] for cat in CATEGORY_KEYS},
        "row_total": report["grand_total_all"],
    }
    report["footer"] = {
        "total_male": male_row,
        "total_female": female_row,
        "grand_total": grand_row,
    }
    return report


def build_attendance_statistics_report(**kwargs) -> dict[str, Any]:
    report = build_attendance_statistics(**kwargs)
    return _fix_footer_rows(report)


def build_attendance_statistics_csv(report: dict[str, Any]) -> str:
    import csv
    from io import StringIO

    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Period", f"{report.get('period_start')} to {report.get('period_end')}"])
    writer.writerow(["Metric", report.get("metric_label", "")])
    writer.writerow([])
    headers = [
        "Clinic",
        "Gender",
        "Staff",
        "Officers",
        "Employee Dependants",
        "Retirees",
        "Retiree Dependents",
        "Non NPA",
        "Row Total",
    ]
    writer.writerow(headers)
    for block in report.get("clinics") or []:
        label = block.get("label", "")
        for row in block.get("rows") or []:
            writer.writerow(
                [
                    label,
                    row.get("gender_label", ""),
                    row.get("staff", 0),
                    row.get("officers", 0),
                    row.get("employee_dependants", 0),
                    row.get("retirees", 0),
                    row.get("retiree_dependents", 0),
                    row.get("non_npa", 0),
                    row.get("row_total", 0),
                ]
            )
    footer = report.get("footer") or {}
    for key in ("total_male", "total_female", "grand_total"):
        row = footer.get(key)
        if row:
            writer.writerow(
                [
                    row.get("gender_label", key),
                    "",
                    row.get("staff", 0),
                    row.get("officers", 0),
                    row.get("employee_dependants", 0),
                    row.get("retirees", 0),
                    row.get("retiree_dependents", 0),
                    row.get("non_npa", 0),
                    row.get("row_total", 0),
                ]
            )
    return buf.getvalue()
