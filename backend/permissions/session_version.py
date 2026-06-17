"""Bump ``User.permissions_version`` when role or page overrides change."""
from __future__ import annotations

from django.db.models import F

from django.contrib.auth import get_user_model

User = get_user_model()


def bump_user_permissions_version(user_id: int) -> None:
    User.objects.filter(pk=user_id).update(permissions_version=F("permissions_version") + 1)


def bump_users_for_role(role_id: int) -> None:
    from permissions.models import UserRole

    user_ids = UserRole.objects.filter(role_id=role_id).values_list("user_id", flat=True).distinct()
    if user_ids:
        User.objects.filter(pk__in=list(user_ids)).update(permissions_version=F("permissions_version") + 1)
