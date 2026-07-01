"""
Consultation queue notification helpers.
"""
from __future__ import annotations

import logging
from typing import Optional

from .models import ConsultationRoom
from .room_presence import get_active_occupancy

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
    Notify the doctor currently checked into ``room``, if any.

    Returns the number of notifications created (0 or 1).
    """
    from notifications.services import NotificationService

    occupancy = get_active_occupancy(room)
    if occupancy is None or occupancy.doctor_id is None:
        logger.info(
            'Skipped queue notification for %s — no doctor checked in',
            room.name,
        )
        return 0

    doctor = occupancy.doctor
    notifications = NotificationService.notify_users(
        users=[doctor],
        title=title,
        message=message,
        notification_type=notification_type,
        priority=priority,
        action_url=action_url,
        object_type=object_type,
        object_id=object_id,
    )
    return len(notifications)
