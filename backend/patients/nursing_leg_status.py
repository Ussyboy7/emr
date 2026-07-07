"""Per-clinic nursing workflow leg status for multi-clinic visits."""
from __future__ import annotations

from typing import Optional

from common.clinic_utils import active_opd_service_matches_code, normalize_clinic_name


def is_physio_clinic(clinic: Optional[str]) -> bool:
    if not clinic:
        return False
    if active_opd_service_matches_code(clinic, 'physiotherapy'):
        return True
    return 'physiotherapy' in str(clinic).lower()


def is_eye_clinic(clinic: Optional[str]) -> bool:
    if not clinic:
        return False
    if active_opd_service_matches_code(clinic, 'eye-clinic'):
        return True
    low = str(clinic).lower()
    return 'eye' in low and 'physiotherapy' not in low


def is_consultation_room_clinic(clinic: Optional[str]) -> bool:
    return bool(clinic) and not is_physio_clinic(clinic) and not is_eye_clinic(clinic)


def visit_service_clinics(visit) -> list[str]:
    clinics = list(visit.clinics or [])
    if visit.clinic and visit.clinic not in clinics:
        clinics.append(visit.clinic)
    return clinics


def consultation_clinics_on_visit(visit) -> list[str]:
    return [c for c in visit_service_clinics(visit) if is_consultation_room_clinic(c)]


def _match_visit_clinic_name(visit, clinic_name: str) -> Optional[str]:
    target = normalize_clinic_name(clinic_name)
    if not target:
        return None
    for c in visit_service_clinics(visit):
        if normalize_clinic_name(c).lower() == target.lower():
            return c
    return None


def mark_visit_clinic_completed(visit, clinic_name: str) -> bool:
    """Append a clinic to visit.completed_clinics if not already present."""
    matched = _match_visit_clinic_name(visit, clinic_name)
    if not matched:
        return False
    done = list(visit.completed_clinics or [])
    if matched in done:
        return False
    done.append(matched)
    visit.completed_clinics = done
    return True


def resolve_session_completed_clinic(visit, session) -> Optional[str]:
    """Best-effort clinic name to mark done when a consultation session ends."""
    consult = consultation_clinics_on_visit(visit)
    if not consult:
        return None
    room = getattr(session, 'room', None)
    if room is not None and getattr(room, 'clinic_id', None):
        clinic_name = getattr(room.clinic, 'name', None)
        if clinic_name:
            matched = _match_visit_clinic_name(visit, clinic_name)
            if matched:
                return matched
    if len(consult) == 1:
        return consult[0]
    return None


def mark_consultation_session_clinic_completed(visit, session) -> bool:
    clinic = resolve_session_completed_clinic(visit, session)
    if not clinic:
        return False
    return mark_visit_clinic_completed(visit, clinic)


def order_leg_state(status: str) -> str:
    if status == 'completed':
        return 'completed'
    if status == 'in_progress':
        return 'in_progress'
    if status in ('pending', 'scheduled'):
        return 'routed'
    return 'pending'


def consultation_leg_state(
    *,
    visit_clinics: list[str],
    completed_clinics: list[str],
    has_active_queue: bool,
    has_open_session: bool,
) -> str:
    consult = [c for c in visit_clinics if is_consultation_room_clinic(c)]
    if not consult:
        return 'pending'
    done = set(completed_clinics or [])
    if all(c in done for c in consult):
        return 'completed'
    if has_open_session:
        return 'in_progress'
    if has_active_queue:
        return 'routed'
    return 'pending'


def visit_should_close_after_clinic_completion(visit) -> bool:
    """True when every clinic on the visit has been marked completed."""
    clinics = visit_service_clinics(visit)
    if not clinics:
        return True
    if len(clinics) == 1:
        return True
    return visit.is_fully_completed


def apply_visit_completion_after_leg(visit) -> bool:
    """Set visit.status=completed when all clinics are done. Returns True if status changed."""
    if not visit_should_close_after_clinic_completion(visit):
        return False
    if visit.status == 'completed':
        return False
    visit.status = 'completed'
    return True
