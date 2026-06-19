"""
Org-wide session security policy (idle timeout) stored in SystemConfig.
"""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from .models import SystemConfig

SECURITY_IDLE_SESSION_TIMEOUT_KEY = "security.idle_session_timeout_minutes"
DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES = 30
MIN_IDLE_SESSION_TIMEOUT_MINUTES = 5
MAX_IDLE_SESSION_TIMEOUT_MINUTES = 240


def clamp_idle_session_timeout_minutes(value) -> int:
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        return DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES
    return max(
        MIN_IDLE_SESSION_TIMEOUT_MINUTES,
        min(MAX_IDLE_SESSION_TIMEOUT_MINUTES, minutes),
    )


def get_idle_session_timeout_minutes() -> int:
    raw = SystemConfig.get_value(
        SECURITY_IDLE_SESSION_TIMEOUT_KEY,
        DEFAULT_IDLE_SESSION_TIMEOUT_MINUTES,
    )
    return clamp_idle_session_timeout_minutes(raw)


def set_idle_session_timeout_minutes(minutes) -> int:
    clamped = clamp_idle_session_timeout_minutes(minutes)
    SystemConfig.objects.update_or_create(
        key=SECURITY_IDLE_SESSION_TIMEOUT_KEY,
        defaults={
            "value": clamped,
            "description": (
                "Org-wide idle session timeout in minutes. "
                "Users must have API activity within this window."
            ),
        },
    )
    return clamped


def idle_session_timeout_delta() -> timedelta:
    return timedelta(minutes=get_idle_session_timeout_minutes())


def user_idle_session_expired(user, *, now=None) -> bool:
    if user is None or not getattr(user, "is_authenticated", False) or not user.pk:
        return False
    last = getattr(user, "last_activity", None)
    if last is None:
        return False
    now = now or timezone.now()
    return last < now - idle_session_timeout_delta()
