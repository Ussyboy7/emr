"""Helpers for keeping dependent patient_id values in sync with their principal."""

from __future__ import annotations

from django.db import transaction

from patients.models import Patient

TEMP_PREFIX = "__RENORM-"


def _dependent_id_prefix(principal: Patient) -> str:
    return "ED" if principal.category == "employee" else "RD"


def compute_dependent_patient_id(principal: Patient, sequence: int) -> str:
    base_number = (principal.personal_number or "").strip().upper()
    if not base_number:
        raise ValueError("Principal personal number is required to generate dependent patient_id")
    prefix = _dependent_id_prefix(principal)
    return f"{prefix}-{base_number}-{sequence}"


def dependents_for_principal(principal: Patient):
    return Patient.objects.filter(
        category="dependent",
        principal_staff=principal,
        merged_into__isnull=True,
    ).order_by("created_at", "id")


def default_dependent_type_for_principal(principal: Patient) -> str:
    if principal.category == "retiree":
        return "Retiree Dependent"
    return "Employee Dependent"


def sync_dependents_with_principal(principal: Patient, *, update_dependent_type: bool = True) -> int:
    """
    Align dependents with their principal: refresh dependent_type (ED/RD label)
    and reassign patient_id prefixes/sequences via sync_dependent_patient_ids.
    """
    if principal.category not in ("employee", "retiree"):
        return 0

    deps = list(dependents_for_principal(principal))
    if not deps:
        return 0

    if update_dependent_type:
        target_type = default_dependent_type_for_principal(principal)
        Patient.objects.filter(pk__in=[dep.pk for dep in deps]).exclude(
            dependent_type=target_type
        ).update(dependent_type=target_type)

    return sync_dependent_patient_ids(principal)


def planned_dependent_patient_ids(principal: Patient) -> list[tuple[Patient, str]]:
    """Return (dependent, target_patient_id) pairs in canonical order."""
    deps = list(dependents_for_principal(principal))
    if not deps:
        return []
    base_number = (principal.personal_number or "").strip().upper()
    if not base_number:
        return []
    prefix = _dependent_id_prefix(principal)
    return [
        (dep, f"{prefix}-{base_number}-{index}")
        for index, dep in enumerate(deps, start=1)
    ]


def sync_dependent_patient_ids(principal: Patient) -> int:
    """
    Reassign patient_id for all dependents of a principal to
    ED-/RD-{personal_number}-{seq} in created_at order.

    Uses a two-phase temporary-ID rename so promotions and bulk normalisation
    do not hit unique constraint collisions when IDs are reshuffled.
    """
    if principal.category not in ("employee", "retiree"):
        return 0

    planned = planned_dependent_patient_ids(principal)
    if not planned:
        return 0

    if all(dep.patient_id == target for dep, target in planned):
        return 0

    with transaction.atomic():
        for dep, _target in planned:
            temp_id = f"{TEMP_PREFIX}{dep.pk}__"
            if dep.patient_id != temp_id:
                dep.patient_id = temp_id
                dep.save(update_fields=["patient_id"])
        for dep, target in planned:
            dep.patient_id = target
            dep.save(update_fields=["patient_id"])

    return len(planned)
