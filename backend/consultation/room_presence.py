"""
Doctor presence helpers for consultation rooms.
"""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import ConsultationRoom, ConsultationRoomOccupancy

# Auto check-out when no heartbeat/check-in activity for this long.
ROOM_PRESENCE_STALE_MINUTES = 45


def user_can_override_room_presence(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    from permissions.user_capabilities import user_has_capability
    return user_has_capability(user, 'consultation_queue_override')


def _presence_override_from_request(request) -> tuple[bool, str]:
    if request is None:
        return False, ''
    override = str(request.data.get('override_presence') or '').lower() in {
        '1', 'true', 'yes', 'on',
    }
    reason = str(request.data.get('override_reason') or '').strip()
    return override, reason


def _checkout_occupancy(occupancy: ConsultationRoomOccupancy, *, now=None) -> None:
    now = now or timezone.now()
    occupancy.is_active = False
    occupancy.status = ConsultationRoomOccupancy.STATUS_AWAY
    occupancy.checked_out_at = now
    occupancy.last_seen_at = now
    occupancy.save(
        update_fields=['is_active', 'status', 'checked_out_at', 'last_seen_at'],
    )


def expire_occupancy_if_stale(
    occupancy: ConsultationRoomOccupancy | None,
) -> ConsultationRoomOccupancy | None:
    if occupancy is None or not occupancy.is_active:
        return None
    cutoff = timezone.now() - timedelta(minutes=ROOM_PRESENCE_STALE_MINUTES)
    if occupancy.last_seen_at and occupancy.last_seen_at >= cutoff:
        return occupancy
    _checkout_occupancy(occupancy)
    return None


def get_active_occupancy(room: ConsultationRoom) -> ConsultationRoomOccupancy | None:
    active = getattr(room, '_active_occupancies', None)
    if active is not None:
        occupancy = active[0] if active else None
    else:
        occupancy = (
            ConsultationRoomOccupancy.objects.filter(room=room, is_active=True)
            .select_related('doctor')
            .first()
        )
    return expire_occupancy_if_stale(occupancy)


def touch_occupancy(occupancy: ConsultationRoomOccupancy) -> None:
    occupancy.last_seen_at = timezone.now()
    occupancy.save(update_fields=['last_seen_at'])


def room_accepting_patients(room: ConsultationRoom) -> bool:
    occupancy = get_active_occupancy(room)
    return occupancy is not None and occupancy.status == ConsultationRoomOccupancy.STATUS_ON_SEAT


def assert_room_operational(room: ConsultationRoom) -> None:
    if room.status != 'active' or not room.is_active:
        raise ValidationError({
            'non_field_errors': [f'{room.name} is not available for patient assignment.']
        })


def assert_room_accepting_patients(room: ConsultationRoom, *, request=None) -> None:
    assert_room_operational(room)

    if request is not None and user_can_override_room_presence(request.user):
        override, reason = _presence_override_from_request(request)
        if override:
            if not reason:
                raise ValidationError({
                    'override_reason': ['A reason is required when overriding room presence.']
                })
            return

    occupancy = get_active_occupancy(room)
    if occupancy is None:
        raise ValidationError({
            'non_field_errors': [
                f'No doctor is on seat in {room.name}. '
                'Patients cannot be sent until a doctor checks in.'
            ]
        })
    if occupancy.status != ConsultationRoomOccupancy.STATUS_ON_SEAT:
        raise ValidationError({
            'non_field_errors': [
                f'Doctor in {room.name} is not accepting patients right now.'
            ]
        })


def presence_override_audit_suffix(request) -> str:
    override, reason = _presence_override_from_request(request)
    if override and reason:
        return f' (presence override: {reason})'
    return ''


def checkout_other_rooms_for_doctor(doctor, *, exclude_room_id: int | None = None) -> None:
    qs = ConsultationRoomOccupancy.objects.filter(doctor=doctor, is_active=True)
    if exclude_room_id is not None:
        qs = qs.exclude(room_id=exclude_room_id)
    now = timezone.now()
    qs.update(
        is_active=False,
        status=ConsultationRoomOccupancy.STATUS_AWAY,
        checked_out_at=now,
        last_seen_at=now,
    )
