"""
Annual check-up compliance matrix for HR dashboards.

Buckets: completed | in_progress | exempt | due | overdue
"""

from __future__ import annotations

from datetime import date

from django.db.models import Q, QuerySet

from patients.models import AnnualCheckup, AnnualCheckupExemption, Patient

PROGRAMME_DUE_MONTH = 11
PROGRAMME_DUE_DAY = 30
DEFAULT_COMPLIANCE_PAGE_SIZE = 50
MAX_COMPLIANCE_PAGE_SIZE = 100


def programme_due_date(programme_year: int) -> date:
    return date(programme_year, PROGRAMME_DUE_MONTH, PROGRAMME_DUE_DAY)


def next_programme_due_date(programme_year: int) -> date:
    return date(programme_year + 1, PROGRAMME_DUE_MONTH, PROGRAMME_DUE_DAY)


def _empty_compliance_summary() -> dict:
    return {
        "completed": 0,
        "in_progress": 0,
        "exempt": 0,
        "due": 0,
        "overdue": 0,
        "total_eligible": 0,
    }


def _compliance_bucket(
    *,
    programme_year: int,
    today: date,
    has_exemption: bool,
    checkup: AnnualCheckup | None,
) -> str:
    if has_exemption:
        return "exempt"
    if checkup:
        if checkup.status == "completed":
            return "completed"
        if checkup.status == "in_progress":
            return "in_progress"
    due = programme_due_date(programme_year)
    if today > due:
        return "overdue"
    return "due"


def _eligible_employees_queryset(
    *,
    division: str | None = None,
    search: str | None = None,
) -> QuerySet[Patient]:
    eligible = Patient.objects.filter(category="employee", is_active=True)
    if division:
        eligible = eligible.filter(division=division)
    if search:
        q = search.strip()
        if q:
            eligible = eligible.filter(
                Q(surname__icontains=q)
                | Q(first_name__icontains=q)
                | Q(personal_number__icontains=q)
                | Q(patient_id__icontains=q)
            )
    return eligible


def _load_programme_maps(
    programme_year: int,
    patient_ids: list[int],
) -> tuple[dict[int, AnnualCheckup], dict[int, AnnualCheckupExemption]]:
    if not patient_ids:
        return {}, {}
    checkups = {
        c.patient_id: c
        for c in AnnualCheckup.objects.filter(
            programme_year=programme_year,
            patient_id__in=patient_ids,
        ).select_related("visit", "signed_off_by")
    }
    exemptions = {
        e.patient_id: e
        for e in AnnualCheckupExemption.objects.filter(
            programme_year=programme_year,
            patient_id__in=patient_ids,
        )
    }
    return checkups, exemptions


def _compliance_row_dict(
    *,
    patient: Patient,
    programme_year: int,
    bucket: str,
    checkup: AnnualCheckup | None,
    exemption: AnnualCheckupExemption | None,
) -> dict:
    return {
        "patient_id": patient.id,
        "patient_display_id": patient.patient_id,
        "personal_number": patient.personal_number or "",
        "full_name": patient.get_full_name(),
        "division": patient.division or "",
        "location": patient.location or "",
        "location_clinic_name": (
            patient.location_clinic.name if patient.location_clinic_id else ""
        ),
        "programme_year": programme_year,
        "compliance_status": bucket,
        "annual_checkup_id": checkup.id if checkup else None,
        "visit_id": checkup.visit.visit_id if checkup and checkup.visit_id else None,
        "visit_date": (
            str(checkup.visit.date) if checkup and checkup.visit_id else None
        ),
        "fitness_outcome": checkup.fitness_outcome if checkup else "",
        "fitness_outcome_display": (
            checkup.get_fitness_outcome_display()
            if checkup and checkup.fitness_outcome
            else ""
        ),
        "outcome_notes": checkup.outcome_notes if checkup else "",
        "signed_off_at": (
            checkup.signed_off_at.isoformat()
            if checkup and checkup.signed_off_at
            else None
        ),
        "has_outcome_letter": bool(checkup and checkup.outcome_letter_pdf),
        "exemption_reason": exemption.get_reason_display() if exemption else "",
        "exemption_notes": exemption.notes if exemption else "",
    }


def _normalized_status_filter(compliance_status: str | None) -> str | None:
    if compliance_status and compliance_status != "all":
        return compliance_status
    return None


def _iterate_filtered_compliance(
    programme_year: int,
    *,
    division: str | None = None,
    compliance_status: str | None = None,
    search: str | None = None,
):
    """Yield (patient, bucket, checkup, exemption) for each filtered employee."""
    today = date.today()
    eligible = _eligible_employees_queryset(division=division, search=search).order_by(
        "surname", "first_name", "id"
    )
    patient_ids = list(eligible.values_list("id", flat=True))
    checkups, exemptions = _load_programme_maps(programme_year, patient_ids)
    status_filter = _normalized_status_filter(compliance_status)

    for patient in eligible.select_related("location_clinic"):
        checkup = checkups.get(patient.id)
        exemption = exemptions.get(patient.id)
        bucket = _compliance_bucket(
            programme_year=programme_year,
            today=today,
            has_exemption=exemption is not None,
            checkup=checkup,
        )
        if status_filter and bucket != status_filter:
            continue
        yield patient, bucket, checkup, exemption


def paginate_compliance(
    programme_year: int,
    *,
    division: str | None = None,
    compliance_status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = DEFAULT_COMPLIANCE_PAGE_SIZE,
) -> tuple[list[dict], dict, int]:
    """
    Single pass over filtered employees: summary counts + one page of row dicts.
    Returns (page_rows, summary, total_filtered_count).
    """
    page = max(1, page)
    page_size = min(MAX_COMPLIANCE_PAGE_SIZE, max(1, page_size))
    offset = (page - 1) * page_size

    summary = _empty_compliance_summary()
    page_rows: list[dict] = []
    filtered_index = 0

    for patient, bucket, checkup, exemption in _iterate_filtered_compliance(
        programme_year,
        division=division,
        compliance_status=compliance_status,
        search=search,
    ):
        summary[bucket] = summary.get(bucket, 0) + 1
        if filtered_index >= offset and len(page_rows) < page_size:
            page_rows.append(
                _compliance_row_dict(
                    patient=patient,
                    programme_year=programme_year,
                    bucket=bucket,
                    checkup=checkup,
                    exemption=exemption,
                )
            )
        filtered_index += 1

    summary["total_eligible"] = filtered_index
    return page_rows, summary, filtered_index


def summarize_compliance_programme(
    programme_year: int,
    *,
    division: str | None = None,
    compliance_status: str | None = None,
    search: str | None = None,
) -> dict:
    """Count-only pass — no row dict allocation."""
    summary = _empty_compliance_summary()
    for _patient, bucket, _checkup, _exemption in _iterate_filtered_compliance(
        programme_year,
        division=division,
        compliance_status=compliance_status,
        search=search,
    ):
        summary[bucket] = summary.get(bucket, 0) + 1
        summary["total_eligible"] += 1
    return summary


def build_compliance_rows(
    programme_year: int,
    *,
    division: str | None = None,
    compliance_status: str | None = None,
    search: str | None = None,
) -> list[dict]:
    """Full row list for CSV export."""
    rows: list[dict] = []
    for patient, bucket, checkup, exemption in _iterate_filtered_compliance(
        programme_year,
        division=division,
        compliance_status=compliance_status,
        search=search,
    ):
        rows.append(
            _compliance_row_dict(
                patient=patient,
                programme_year=programme_year,
                bucket=bucket,
                checkup=checkup,
                exemption=exemption,
            )
        )
    return rows


def summarize_compliance_rows(rows: list[dict]) -> dict:
    summary = _empty_compliance_summary()
    summary["total_eligible"] = len(rows)
    for row in rows:
        summary[row["compliance_status"]] = summary.get(row["compliance_status"], 0) + 1
    return summary


def compliance_summary(programme_year: int) -> dict:
    return summarize_compliance_programme(programme_year)
