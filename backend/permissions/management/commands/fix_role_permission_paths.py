"""
Fix legacy/incorrect role permission page paths in the database.

Currently fixes:
- /consultation/dashboard  -> /consultation

Usage:
  python manage.py fix_role_permission_paths          # dry run
  python manage.py fix_role_permission_paths --apply  # persist changes
"""

from django.core.management.base import BaseCommand

from permissions.models import Role


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
        }

        changed_roles = 0
        changed_total = 0

        for role in Role.objects.all().order_by("name"):
            perms = role.permissions or []
            if not isinstance(perms, list):
                continue

            original = list(perms)

            updated = []
            for p in original:
                if not isinstance(p, str):
                    updated.append(p)
                    continue
                updated.append(replacements.get(p, p))

            # De-duplicate while preserving order
            deduped = []
            seen = set()
            for p in updated:
                key = p if isinstance(p, str) else repr(p)
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(p)

            if deduped != original:
                changed_roles += 1
                changed_total += sum(1 for a, b in zip(original, deduped) if a != b) + abs(len(original) - len(deduped))
                self.stdout.write(
                    f"- {role.name}: {len(original)} -> {len(deduped)} page(s) ({'APPLY' if apply else 'DRY RUN'})"
                )
                if apply:
                    role.permissions = deduped
                    role.save(update_fields=["permissions"])

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Roles changed: {changed_roles}"))
        self.stdout.write(self.style.SUCCESS(f"Total edits (approx): {changed_total}"))
        if not apply:
            self.stdout.write(self.style.WARNING("Dry run only. Re-run with --apply to persist changes."))

