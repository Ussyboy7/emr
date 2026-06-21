"""Parse dependent patient IDs and resolve principals from personal numbers."""

from __future__ import annotations

import re

from patients.models import Patient

DEPENDENT_ID_RE = re.compile(r"^(ED|RD)-([^-]+)-(\d+)$", re.IGNORECASE)


def parse_dependent_patient_id(patient_id: str | None):
    """Return (prefix, personal_number, sequence, preferred_principal_category) or None."""
    match = DEPENDENT_ID_RE.match((patient_id or "").strip())
    if not match:
        return None
    prefix = match.group(1).upper()
    personal_number = match.group(2).upper()
    sequence = int(match.group(3))
    preferred_category = "employee" if prefix == "ED" else "retiree"
    return prefix, personal_number, sequence, preferred_category


def find_principal_for_dependent_id(patient_id: str | None) -> Patient | None:
    parsed = parse_dependent_patient_id(patient_id)
    if not parsed:
        return None
    _prefix, personal_number, _sequence, preferred_category = parsed
    return find_principal_by_personal_number(personal_number, preferred_category)


def find_principal_by_personal_number(
    personal_number: str,
    preferred_category: str | None = None,
) -> Patient | None:
    base_qs = Patient.objects.filter(
        personal_number__iexact=personal_number.strip(),
        category__in=["employee", "retiree"],
        merged_into__isnull=True,
        is_active=True,
    )
    if preferred_category:
        match = base_qs.filter(category=preferred_category).first()
        if match:
            return match
    return base_qs.first()


def normalize_person_name(patient: Patient) -> str:
    return " ".join(
        part
        for part in [
            (patient.surname or "").strip().upper(),
            (patient.first_name or "").strip().upper(),
            (patient.middle_name or "").strip().upper(),
        ]
        if part
    )
