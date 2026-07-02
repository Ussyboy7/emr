"""Claim shared room queue rows when a doctor starts a consultation."""
from __future__ import annotations

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import ConsultationQueue, ConsultationSession
from .room_presence import get_doctor_occupancy


def assert_doctor_checked_into_room(*, room, doctor) -> None:
    occupancy = get_doctor_occupancy(room, doctor)
    if occupancy is None:
        raise ValidationError({
            'non_field_errors': [
                f'You must check into {room.name} before starting a consultation.',
            ],
        })


def assert_patient_not_in_other_doctors_session(*, room, patient, doctor) -> None:
    conflict = (
        ConsultationSession.objects.filter(
            room=room,
            patient=patient,
            status='active',
        )
        .exclude(doctor_id=getattr(doctor, 'pk', doctor))
        .select_related('doctor')
        .first()
    )
    if conflict is None:
        return
    other_name = conflict.doctor.get_full_name() if conflict.doctor else 'another doctor'
    raise ValidationError({
        'non_field_errors': [
            f'This patient is already in consultation with {other_name} in {room.name}.',
        ],
    })


def claim_queue_for_session(session: ConsultationSession) -> int:
    """Deactivate active queue rows for this patient in the room (claim on start)."""
    now = timezone.now()
    return ConsultationQueue.objects.filter(
        room_id=session.room_id,
        patient_id=session.patient_id,
        is_active=True,
    ).update(is_active=False, called_at=now)
