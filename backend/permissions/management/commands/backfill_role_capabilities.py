"""
Backfill explicit capability grants on access roles (dry-run by default).

Admin-type roles receive all capabilities at runtime without DB storage; this command
persists them on the role JSON for the Roles UI and effective-access preview.

Also supports name-based presets for common production roles and page-implied caps.

Usage:
  python manage.py backfill_role_capabilities
  python manage.py backfill_role_capabilities --apply
  python manage.py backfill_role_capabilities --apply --admin-types --name-presets --page-implied
  python manage.py backfill_role_capabilities --role "System Administrator" --capability patient_merge --apply

After --apply, users assigned to changed roles get permissions_version bumped (forces re-login).
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from permissions.capabilities import ALL_CAPABILITY_IDS, PAGE_TO_CAPABILITIES
from permissions.models import Role
from permissions.role_permissions import (
    normalize_role_capabilities_list,
    normalize_role_permissions_list,
    normalize_role_permissions_payload,
)
from permissions.session_version import bump_users_for_role

# Case-insensitive exact role name → capability ids to merge.
NAME_PRESETS: dict[str, tuple[str, ...]] = {
    "system administrator": tuple(sorted(ALL_CAPABILITY_IDS)),
    "ict administrator": tuple(sorted(ALL_CAPABILITY_IDS)),
    "admin staff": (
        "patient_delete",
        "patient_merge",
        "patient_unmerge",
        "annual_checkup_programme_edit",
        "annual_checkup_programme_catalog_admin",
        "notification_routing_manage",
    ),
    "medical records officer": (
        "patient_convert_retiree",
        "patient_promote_officer",
        "patient_convert_csr",
    ),
    "medical doctor": ("annual_checkup_signoff",),
    "human resources officer": ("hr_compliance_manage",),
}


def _capabilities_implied_by_pages(pages: set[str]) -> set[str]:
    caps: set[str] = set()
    for page in pages:
        for prefix, implied in PAGE_TO_CAPABILITIES.items():
            if page == prefix or page.startswith(prefix + "/"):
                caps |= set(implied)
    return caps


def _merge_caps(existing: list[str], extra: set[str]) -> list[str]:
    return sorted(set(existing) | extra)


class Command(BaseCommand):
    help = "Backfill role.permissions capabilities (dry-run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist changes and bump permissions_version for affected users.",
        )
        parser.add_argument(
            "--admin-types",
            action="store_true",
            help="Grant all capabilities to roles with type=admin.",
        )
        parser.add_argument(
            "--name-presets",
            action="store_true",
            help=f"Merge capabilities for known role names ({len(NAME_PRESETS)} presets).",
        )
        parser.add_argument(
            "--page-implied",
            action="store_true",
            help="Grant capabilities implied by pages already on each role.",
        )
        parser.add_argument(
            "--role",
            action="append",
            default=[],
            metavar="NAME",
            help="Limit to role(s) by exact name (repeatable).",
        )
        parser.add_argument(
            "--capability",
            action="append",
            default=[],
            metavar="ID",
            help="When used with --role, grant only these capability ids (repeatable).",
        )
        parser.add_argument(
            "--no-bump-users",
            action="store_true",
            help="With --apply, do not bump permissions_version for assigned users.",
        )

    def handle(self, *args, **options):
        apply = bool(options["apply"])
        admin_types = bool(options["admin_types"])
        name_presets = bool(options["name_presets"])
        page_implied = bool(options["page_implied"])
        role_names = options["role"] or []
        extra_caps = options["capability"] or []
        bump_users = apply and not bool(options["no_bump_users"])

        if not any([admin_types, name_presets, page_implied, role_names]):
            admin_types = True
            name_presets = True
            page_implied = True
            self.stdout.write(
                self.style.WARNING(
                    "No mode flags passed — defaulting to --admin-types --name-presets --page-implied"
                )
            )

        qs = Role.objects.all().order_by("name")
        if role_names:
            qs = qs.filter(name__in=role_names)

        changed = 0
        for role in qs:
            pages = set(normalize_role_permissions_list(role.permissions))
            existing = normalize_role_capabilities_list(role.permissions)
            merged = set(existing)

            if admin_types and role.type == "admin":
                merged |= set(ALL_CAPABILITY_IDS)

            preset = NAME_PRESETS.get(role.name.strip().lower())
            if name_presets and preset:
                merged |= set(preset)

            if page_implied and pages:
                merged |= _capabilities_implied_by_pages(pages)

            if extra_caps and (not role_names or role.name in role_names):
                merged |= set(extra_caps)

            new_caps = sorted(merged)
            if new_caps == sorted(existing):
                continue

            changed += 1
            added = sorted(set(new_caps) - set(existing))
            self.stdout.write(
                f"- {role.name}: +{len(added)} capability(s) "
                f"({', '.join(added[:5])}{'…' if len(added) > 5 else ''}) "
                f"{'APPLY' if apply else 'DRY RUN'}"
            )

            if apply:
                role.permissions = normalize_role_permissions_payload(
                    {"pages": normalize_role_permissions_list(role.permissions), "capabilities": new_caps}
                )
                role.save(update_fields=["permissions"])
                if bump_users:
                    bump_users_for_role(role.id)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Roles updated: {changed}"))
        if not apply:
            self.stdout.write(
                self.style.WARNING("Dry run only. Re-run with --apply to persist changes.")
            )
        elif bump_users and changed:
            self.stdout.write(
                self.style.WARNING(
                    "Assigned users were bumped (permissions_version). They must sign in again."
                )
            )
