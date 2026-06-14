"""
Annual check-up compliance matrix for HR dashboards.

Buckets: completed | in_progress | exempt | due | overdue
"""

from __future__ import annotations

from datetime import date

from django.db.models import Q

from patients.models import AnnualCheckup, AnnualCheckupExemption, Patient


PROGRAMME_DUE_MONTH = 11
PROGRAMME_DUE_DAY = 30


def programme_due_date(programme_year: int) -> date:
    return date(programme_year, PROGRAMME_DUE_MONTH, PROGRAMME_DUE_DAY)


def next_programme_due_date(programme_year: int) -> date:
    return date(programme_year + 1, PROGRAMME_DUE_MONTH, PROGRAMME_DUE_DAY)


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


def build_compliance_rows(
    programme_year: int,
    *,
    division: str | None = None,
    compliance_status: str | None = None,
    search: str | None = None,
) -> list[dict]:
    today = date.today()
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

    patient_ids = list(eligible.values_list("id", flat=True))
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

    rows: list[dict] = []
    for patient in eligible.select_related("location_clinic"):
        checkup = checkups.get(patient.id)
        exemption = exemptions.get(patient.id)
        bucket = _compliance_bucket(
            programme_year=programme_year,
            today=today,
            has_exemption=exemption is not None,
            checkup=checkup,
        )
        if compliance_status and compliance_status != "all" and bucket != compliance_status:
            continue

        rows.append(
            {
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
                "visit_id": checkup.visit.visit_id if checkup else None,
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
                "has_outcome_letter": bool(
                    checkup and checkup.outcome_letter_pdf
                ),
                "exemption_reason": exemption.get_reason_display() if exemption else "",
                "exemption_notes": exemption.notes if exemption else "",
            }
        )
    return rows


def compliance_summary(programme_year: int) -> dict:
    rows = build_compliance_rows(programme_year)
    summary = {
        "completed": 0,
        "in_progress": 0,
        "exempt": 0,
        "due": 0,
        "overdue": 0,
        "total_eligible": len(rows),
    }
    for row in rows:
        summary[row["compliance_status"]] = summary.get(row["compliance_status"], 0) + 1
    return summary
