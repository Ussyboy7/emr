"""
Consultation queue notification helpers.
"""
from __future__ import annotations

import logging

from .models import ConsultationRoom
from .room_presence import doctors_on_seat

logger = logging.getLogger(__name__)


def notify_doctor_in_room(
    room: ConsultationRoom,
    *,
    title: str,
    message: str,
    action_url: str,
    object_type: str = 'consultation_queue',
    object_id: str = '',
    notification_type: str = 'workflow',
    priority: str = 'high',
) -> int:
    """
    Notify all doctors currently on seat in ``room``.

    Returns the number of notifications created.
    """
    from notifications.services import NotificationService

    on_seat = doctors_on_seat(room)
    if not on_seat:
        logger.info(
            'Skipped queue notification for %s — no doctor checked in',
            room.name,
        )
        return 0

    doctors = [row.doctor for row in on_seat if row.doctor_id is not None]
    if not doctors:
        return 0

    notifications = NotificationService.notify_users(
        users=doctors,
        title=title,
        message=message,
        notification_type=notification_type,
        priority=priority,
        action_url=action_url,
        object_type=object_type,
        object_id=object_id,
    )
    return len(notifications)
