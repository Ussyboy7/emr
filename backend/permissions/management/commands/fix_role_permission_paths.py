"""
Fix legacy role.permissions shape and page paths in the database.

- Unwraps {"pages": [...]} into a plain list (same canonical shape as the API and Role.save).
- Path rewrites (extend as needed):
  - /consultation/dashboard  -> /consultation
  - /physiotherapy/pool-queue -> /physiotherapy/orders
  - /nursing/patient-vitals -> /nursing/vitals-history

Usage:
  python manage.py fix_role_permission_paths          # dry run
  python manage.py fix_role_permission_paths --apply  # persist changes
"""

from django.core.management.base import BaseCommand

from permissions.models import Role
from permissions.role_permissions import normalize_role_permissions_list


class Command(BaseCommand):
    help = "Fix legacy/incorrect role permission page paths."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply changes to the database (default is dry-run).",
        )

    def handle(self, *args, **options):
        apply = bool(options.get("apply"))

        replacements = {
            "/consultation/dashboard": "/consultation",
            "/physiotherapy/pool-queue": "/physiotherapy/orders",
            "/nursing/patient-vitals": "/nursing/vitals-history",
            "/medical-records/dependents": "/medical-records/patients",
            "/medical-records/reports/attendance-summary": "/medical-records/reports/attendance-statistics",
            "/medical-records/reports/clinic-attendance": "/medical-records/reports/clinic-statistics",
            "/medical-records/reports/gop-attendance": "/medical-records/reports/clinic-statistics",
        }

        changed_roles = 0

        for role in Role.objects.all().order_by("name"):
            raw = role.permissions
            pages = normalize_role_permissions_list(raw)

            updated = []
            for p in pages:
                if not isinstance(p, str):
                    updated.append(p)
                    continue
                updated.append(replacements.get(p, p))

            deduped = []
            seen = set()
            for p in updated:
                key = p if isinstance(p, str) else repr(p)
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(p)

            # Backfill core Medical Records pages for records roles and legacy MR roles.
            has_medical_records_access = role.type == "records" or any(
                isinstance(p, str) and p.startswith("/medical-records") for p in deduped
            )
            if has_medical_records_access:
                for required in (
                    "/medical-records",
                    "/medical-records/patients",
                    "/medical-records/patient-records",
                    "/medical-records/coding",
                ):
                    if required not in deduped:
                        deduped.append(required)

            shape_mismatch = not isinstance(raw, list)
            path_changed = deduped != pages

            if not shape_mismatch and not path_changed:
                continue

            changed_roles += 1
            self.stdout.write(
                f"- {role.name}: shape={'dict/legacy' if shape_mismatch else 'list'} "
                f"{len(pages)} -> {len(deduped)} page(s) ({'APPLY' if apply else 'DRY RUN'})"
            )
            if apply:
                role.permissions = deduped
                role.save(update_fields=["permissions"])

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Roles updated: {changed_roles}"))
        if not apply:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --apply to persist changes."))

