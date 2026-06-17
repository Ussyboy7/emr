"""
Create UserRole rows for users who only have legacy ``User.system_role`` text.

Before page-based RBAC, staff were tagged with ``system_role`` (a string on the user row).
The User Management UI now shows **Access Role** from ``user_roles`` → ``roles``. Users
created or imported without that junction table show "—" even when ``system_role`` is set.

Usage:
  python manage.py backfill_user_access_roles
  python manage.py backfill_user_access_roles --apply
  python manage.py backfill_user_access_roles --apply --bump-users
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Exists, OuterRef

from accounts.models import User
from permissions.access_role import get_primary_user_role, sync_system_role_from_access_role
from permissions.models import Role, UserRole
from permissions.session_version import bump_user_permissions_version


def _role_lookup() -> dict[str, Role]:
    """Map normalized role name → Role (first active match wins)."""
    lookup: dict[str, Role] = {}
    for role in Role.objects.filter(is_active=True).order_by("id"):
        key = (role.name or "").strip().casefold()
        if key and key not in lookup:
            lookup[key] = role
    return lookup


class Command(BaseCommand):
    help = "Backfill UserRole assignments from legacy User.system_role (dry-run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Create missing UserRole rows.",
        )
        parser.add_argument(
            "--no-bump-users",
            action="store_true",
            help="With --apply, do not bump permissions_version for affected users.",
        )
        parser.add_argument(
            "--include-existing",
            action="store_true",
            help="Also process users who already have an access role (re-sync system_role only).",
        )
        parser.add_argument(
            "--user",
            action="append",
            default=[],
            metavar="USERNAME",
            help="Limit to username(s) (repeatable).",
        )

    def handle(self, *args, **options):
        apply = bool(options["apply"])
        bump_users = apply and not bool(options["no_bump_users"])
        include_existing = bool(options["include_existing"])
        usernames = options["user"] or []

        active_role = UserRole.objects.filter(
            user_id=OuterRef("pk"),
            role__is_active=True,
        )
        qs = User.objects.annotate(has_access_role=Exists(active_role)).order_by("username")
        if not include_existing:
            qs = qs.filter(has_access_role=False)
        if usernames:
            qs = qs.filter(username__in=usernames)

        role_lookup = _role_lookup()
        created = 0
        synced = 0
        skipped_no_system_role = 0
        skipped_no_match: list[str] = []
        bumped = 0

        for user in qs.iterator():
            legacy = (user.system_role or "").strip()
            if not legacy and not include_existing:
                if not get_primary_user_role(user):
                    skipped_no_system_role += 1
                continue

            if get_primary_user_role(user):
                if apply and legacy:
                    if sync_system_role_from_access_role(user):
                        synced += 1
                continue

            if not legacy:
                skipped_no_system_role += 1
                continue

            role = role_lookup.get(legacy.casefold())
            if role is None:
                label = user.get_full_name() or user.username
                skipped_no_match.append(f"{label} ({user.username}): system_role={legacy!r}")
                continue

            self.stdout.write(
                f"{'CREATE' if apply else 'WOULD CREATE'}: "
                f"{user.username} → {role.name} (from system_role)"
            )

            if apply:
                with transaction.atomic():
                    UserRole.objects.create(user=user, role=role, assigned_by=None)
                    sync_system_role_from_access_role(user)
                created += 1
                if bump_users:
                    bump_user_permissions_version(user.id)
                    bumped += 1

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Created UserRole rows: {created}"))
        if synced:
            self.stdout.write(f"Synced system_role from existing access role: {synced}")
        if skipped_no_system_role:
            self.stdout.write(
                self.style.WARNING(
                    f"No system_role and no access role (skipped): {skipped_no_system_role}"
                )
            )
        if skipped_no_match:
            self.stdout.write(self.style.WARNING(f"No matching Role for system_role: {len(skipped_no_match)}"))
            for line in skipped_no_match[:20]:
                self.stdout.write(f"  - {line}")
            if len(skipped_no_match) > 20:
                self.stdout.write(f"  … and {len(skipped_no_match) - 20} more")

        if bump_users and bumped:
            self.stdout.write(f"Bumped permissions_version for {bumped} user(s) — they must re-login.")

        if not apply:
            would_create = sum(
                1
                for user in qs
                if not UserRole.objects.filter(user=user, role__is_active=True).exists()
                and (user.system_role or "").strip()
                and role_lookup.get((user.system_role or "").strip().casefold())
            )
            if would_create:
                self.stdout.write(
                    self.style.WARNING(f"Run with --apply to create {would_create} assignment(s).")
                )
            self.stdout.write(self.style.NOTICE("Dry run only (no database changes)."))
