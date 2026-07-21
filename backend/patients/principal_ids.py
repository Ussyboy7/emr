"""Canonical principal patient_id and personal_number helpers."""

from __future__ import annotations

import re

from patients.models import Patient

TEMP_PREFIX = "__NORM-"

MALFORMED_RETIREE_ID_RE = re.compile(r"^R-R-(.+)$", re.IGNORECASE)
MALFORMED_EMPLOYEE_ID_RE = re.compile(r"^E-E-(.+)$", re.IGNORECASE)
RETIREE_ID_RE = re.compile(r"^R-(.+)$", re.IGNORECASE)
EMPLOYEE_ID_RE = re.compile(r"^E-(.+)$", re.IGNORECASE)


def strip_category_prefix_from_personal_number(category: str, personal_number: str | None) -> str:
    pn = (personal_number or "").strip().upper()
    if category == "retiree" and pn.startswith("R-"):
        return pn[2:].strip()
    if category == "employee" and pn.startswith("E-"):
        return pn[2:].strip()
    return pn


def base_number_from_patient_id(patient_id: str | None, category: str) -> str | None:
    pid = (patient_id or "").strip().upper()
    if not pid:
        return None
    if category == "retiree":
        match = MALFORMED_RETIREE_ID_RE.match(pid) or RETIREE_ID_RE.match(pid)
    elif category == "employee":
        match = MALFORMED_EMPLOYEE_ID_RE.match(pid) or EMPLOYEE_ID_RE.match(pid)
    else:
        return None
    return match.group(1).strip().upper() if match else None


def canonical_personal_number(patient: Patient) -> str | None:
    if patient.category not in ("employee", "retiree"):
        return None
    from_pn = strip_category_prefix_from_personal_number(patient.category, patient.personal_number)
    if from_pn:
        return from_pn
    return base_number_from_patient_id(patient.patient_id, patient.category)


def canonical_principal_patient_id(category: str, personal_number: str) -> str:
    pn = strip_category_prefix_from_personal_number(category, personal_number)
    if category == "employee":
        return f"E-{pn}"
    if category == "retiree":
        return f"R-{pn}"
    raise ValueError(f"Unsupported category for principal patient_id: {category}")


def principal_normalization_plan(patient: Patient) -> tuple[str, str] | None:
    """Return (canonical_personal_number, canonical_patient_id) or None if already canonical."""
    if patient.category not in ("employee", "retiree") or patient.merged_into_id:
        return None
    canonical_pn = canonical_personal_number(patient)
    if not canonical_pn:
        return None
    canonical_id = canonical_principal_patient_id(patient.category, canonical_pn)
    current_pn = (patient.personal_number or "").strip().upper()
    if patient.patient_id == canonical_id and current_pn == canonical_pn:
        return None
    return canonical_pn, canonical_id


def principals_needing_normalization():
    return (
        Patient.objects.filter(
            category__in=["employee", "retiree"],
            merged_into__isnull=True,
        )
        .order_by("patient_id", "id")
    )


def normalize_principal_patient(patient: Patient) -> bool:
    """
    Fix redundant R-/E- prefixes on personal_number and patient_id (e.g. R-R-88297 → R-88297).
    Returns True when any field was updated.
    """
    plan = principal_normalization_plan(patient)
    if not plan:
        return False

    canonical_pn, canonical_id = plan

    if (
        Patient.objects.filter(patient_id=canonical_id)
        .exclude(pk=patient.pk)
        .exists()
    ):
        raise ValueError(
            f"Cannot set patient_id={canonical_id}: another patient already uses it."
        )

    from django.db import transaction

    from patients.dependent_ids import sync_dependents_with_principal

    with transaction.atomic():
        update_fields: list[str] = []
        if (patient.personal_number or "").strip().upper() != canonical_pn:
            patient.personal_number = canonical_pn
            update_fields.append("personal_number")
        if update_fields:
            patient.save(update_fields=update_fields)

        if patient.patient_id != canonical_id:
            temp_id = f"{TEMP_PREFIX}{patient.pk}__"
            patient.patient_id = temp_id
            patient.save(update_fields=["patient_id"])
            patient.patient_id = canonical_id
            patient.save(update_fields=["patient_id"])

        sync_dependents_with_principal(patient)

    return True
