"""
Online presence helpers for admin dashboards.

A user is considered online when ``last_activity`` was updated recently
(see ``JWTAuthenticationWithActivity``). Login time alone does not count.
"""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

# Users with API activity within this window appear as "online now".
ONLINE_PRESENCE_WINDOW = timedelta(minutes=2)

# Throttle how often we write ``last_activity`` per user (each JWT request).
ACTIVITY_UPDATE_INTERVAL = timedelta(seconds=30)


def online_presence_cutoff():
    return timezone.now() - ONLINE_PRESENCE_WINDOW


def count_online_users() -> int:
    from accounts.models import User

    return User.objects.filter(
        is_active=True,
        last_activity__gte=online_presence_cutoff(),
    ).count()


def presence_window_seconds() -> int:
    return int(ONLINE_PRESENCE_WINDOW.total_seconds())
