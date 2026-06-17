"""
Create or update module **Support** access roles from existing officer roles.

Officers (employees) keep full access; Support roles are for corps members, IT attachments,
and assistants in the same module.

Usage:
  python manage.py seed_support_roles
  python manage.py seed_support_roles --apply
  python manage.py seed_support_roles --apply --update-existing
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from permissions.models import Role
from permissions.support_roles import (
    ICT_SUPPORT_DESCRIPTION,
    ICT_SUPPORT_NAME,
    ICT_SUPPORT_TYPE,
    OFFICER_SUPPORT_PAIRS,
    build_ict_support_permissions,
    build_support_permissions_from_officer,
    support_description_for_officer,
)


class Command(BaseCommand):
    help = "Seed module Support access roles from officer roles (dry-run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Create or update roles in the database.",
        )
        parser.add_argument(
            "--update-existing",
            action="store_true",
            help="With --apply, refresh permissions on support roles that already exist.",
        )

    def handle(self, *args, **options):
        apply = bool(options["apply"])
        update_existing = bool(options["update_existing"])

        created = 0
        updated = 0
        skipped = 0

        for officer_name, support_name in OFFICER_SUPPORT_PAIRS:
            officer = Role.objects.filter(name=officer_name, is_active=True).first()
            if officer is None:
                self.stdout.write(
                    self.style.WARNING(f"SKIP: officer role not found: {officer_name!r}")
                )
                skipped += 1
                continue

            permissions = build_support_permissions_from_officer(officer)
            description = support_description_for_officer(officer_name, support_name)
            existing = Role.objects.filter(name=support_name).first()

            if existing and not update_existing:
                self.stdout.write(f"EXISTS: {support_name} (use --update-existing to refresh)")
                continue

            action = "UPDATE" if existing else "CREATE"
            if isinstance(permissions, dict):
                page_count = len(permissions.get("pages", []))
            else:
                page_count = len(permissions)

            self.stdout.write(
                f"{action}: {support_name} ← {officer_name} "
                f"({page_count} pages, type={officer.type}) "
                f"{'APPLY' if apply else 'DRY RUN'}"
            )

            if apply:
                if existing:
                    existing.description = description
                    existing.type = officer.type
                    existing.permissions = permissions
                    existing.is_active = True
                    existing.save(update_fields=["description", "type", "permissions", "is_active"])
                    updated += 1
                else:
                    Role.objects.create(
                        name=support_name,
                        type=officer.type,
                        description=description,
                        permissions=permissions,
                        is_active=True,
                    )
                    created += 1

        # ICT Support — standalone (not cloned from System Administrator).
        ict_permissions = build_ict_support_permissions()
        ict_existing = Role.objects.filter(name=ICT_SUPPORT_NAME).first()
        if ict_existing and not update_existing:
            self.stdout.write(f"EXISTS: {ICT_SUPPORT_NAME} (use --update-existing to refresh)")
        else:
            action = "UPDATE" if ict_existing else "CREATE"
            self.stdout.write(
                f"{action}: {ICT_SUPPORT_NAME} (standalone ICT helpdesk) "
                f"{'APPLY' if apply else 'DRY RUN'}"
            )
            if apply:
                if ict_existing:
                    ict_existing.description = ICT_SUPPORT_DESCRIPTION
                    ict_existing.type = ICT_SUPPORT_TYPE
                    ict_existing.permissions = ict_permissions
                    ict_existing.is_active = True
                    ict_existing.save(
                        update_fields=["description", "type", "permissions", "is_active"]
                    )
                    updated += 1
                else:
                    Role.objects.create(
                        name=ICT_SUPPORT_NAME,
                        type=ICT_SUPPORT_TYPE,
                        description=ICT_SUPPORT_DESCRIPTION,
                        permissions=ict_permissions,
                        is_active=True,
                    )
                    created += 1

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Support roles — created: {created}, updated: {updated}, skipped (no officer): {skipped}"
            )
        )
        if not apply:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --apply to persist."))
