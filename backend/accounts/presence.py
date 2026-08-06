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

def list_online_users():
    """Return a list of online user dicts (id, name, email, role, clinic)."""
    from accounts.models import User

    users = User.objects.filter(
        is_active=True,
        last_activity__gte=online_presence_cutoff(),
    ).select_related('location_clinic', 'active_clinic')
    result = []
    for u in users:
        clinic = u.active_clinic or u.location_clinic
        role_label = ''
        if u.is_superuser:
            role_label = 'Super Admin'
        elif u.system_role:
            role_label = u.system_role.replace('_', ' ').title()
        result.append({
            'id': u.id,
            'name': u.get_full_name() or u.email,
            'email': u.email,
            'role': role_label,
            'clinic': clinic.name if clinic else None,
            'lastActivity': u.last_activity.isoformat() if u.last_activity else None,
        })
    return result


def presence_window_seconds() -> int:
    return int(ONLINE_PRESENCE_WINDOW.total_seconds())
