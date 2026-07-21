"""Create or resolve PhysioOrder rows tied to a nursing/consultation visit."""
from __future__ import annotations

from django.utils import timezone

from organization.models import SystemConfig
from patients.nursing_leg_status import is_physio_clinic, visit_service_clinics

ACTIVE_PHYSIO_ORDER_STATUSES = ("pending", "scheduled", "in_progress")


def visit_has_physio_clinic(visit) -> bool:
    return any(is_physio_clinic(c) for c in visit_service_clinics(visit))


def ensure_physio_order_for_visit(
    visit,
    *,
    ordered_by,
    referral_source: str = "system",
    diagnosis: str | None = None,
):
    """
    Return an active PhysioOrder for this visit, creating one if missing.

    Sets location_clinic from visit (or user) when multi-clinic mode is on.
    """
    from physiotherapy.models import PhysioOrder

    if visit is None or visit.patient_id is None:
        return None, False

    if not visit_has_physio_clinic(visit):
        return None, False

    existing = (
        PhysioOrder.objects.filter(
            visit_id=visit.id,
            patient_id=visit.patient_id,
            status__in=ACTIVE_PHYSIO_ORDER_STATUSES,
        )
        .order_by("-ordered_at")
        .first()
    )
    if existing is not None:
        return existing, False

    if not diagnosis:
        from common.diagnosis_resolution import resolve_patient_diagnosis_text

        diagnosis = resolve_patient_diagnosis_text(visit.patient_id) or "Multi-clinic visit — Physiotherapy"

    clinics_label = ", ".join(visit_service_clinics(visit))
    create_kwargs = dict(
        patient_id=visit.patient_id,
        visit_id=visit.id,
        ordered_by=ordered_by,
        consultation_session=None,
        diagnosis=diagnosis,
        history_clinical_findings=f"Visit clinics: {clinics_label}",
        special_instructions="Auto-created for multi-clinic physiotherapy leg",
        priority="normal",
        status="scheduled",
        referral_source=referral_source,
        scheduled_at=timezone.now(),
        sessions_completed=0,
    )

    if SystemConfig.is_enabled("multi_clinic_enabled"):
        from common.order_location import resolve_order_location_clinic

        clinic = resolve_order_location_clinic(visit=visit, user=ordered_by)
        if clinic is not None:
            create_kwargs["location_clinic"] = clinic

    order = PhysioOrder.objects.create(**create_kwargs)
    return order, True


def reopen_visit_if_physio_leg_open(visit) -> bool:
    """If visit was closed early, set status back to in_progress when physio remains."""
    if visit is None or visit.status != "completed":
        return False
    if not visit_has_physio_clinic(visit):
        return False
    done = set(visit.completed_clinics or [])
    pending_physio = any(
        is_physio_clinic(c) and c not in done for c in visit_service_clinics(visit)
    )
    if not pending_physio:
        return False
    visit.status = "in_progress"
    return True
