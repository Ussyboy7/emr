"""
Canonicalize RBAC role names/pages and merge known typo roles.

Usage:
  python manage.py canonicalize_rbac
  python manage.py canonicalize_rbac --apply
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from permissions.models import Role, UserRole
from permissions.role_permissions import normalize_role_permissions_list
from permissions.session_version import bump_user_permissions_version


CANONICAL_EYE_ROLE = "Ophthalmologist"
EYE_ROLE_ALIASES = ("Optamologist", "Optamology")

# Baseline additions for pages that should not remain unassigned.
REQUIRED_PAGES_BY_ROLE_NAME: dict[str, tuple[str, ...]] = {
    "Medical Doctor": ("/consultation/analytics",),
    "Physiotherapist": ("/physiotherapy/analytics",),
    "Ophthalmologist": ("/eyecare/analytics",),
    "Medical Records Officer": (
        "/medical-records/reports/new-registrations",
        "/medical-records/reports/patient-demographics",
    ),
    "Radiologist": ("/radiology/analytics",),
    "System Administrator": (
        "/admin/health",
        "/admin/support-tickets",
        "/radiology/analytics",
    ),
}


class Command(BaseCommand):
    help = "Canonicalize RBAC roles/pages and merge known duplicate typo roles."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist updates (default: dry-run).",
        )

    def _merge_eye_role_aliases(self, *, apply: bool) -> set[int]:
        changed_user_ids: set[int] = set()
        canonical = Role.objects.filter(name=CANONICAL_EYE_ROLE).first()

        aliases = list(Role.objects.filter(name__in=EYE_ROLE_ALIASES))
        if not aliases:
            return changed_user_ids

        if canonical is None:
            template = aliases[0]
            if apply:
                template.name = CANONICAL_EYE_ROLE
                template.save(update_fields=["name"])
            self.stdout.write(
                f"- Created canonical role name from alias: {template.name} -> {CANONICAL_EYE_ROLE} "
                f"({'APPLY' if apply else 'DRY RUN'})"
            )
            canonical = Role.objects.filter(name=CANONICAL_EYE_ROLE).first() if apply else template

        if canonical is None:
            return changed_user_ids

        canonical_pages = set(normalize_role_permissions_list(canonical.permissions))

        for alias in aliases:
            if alias.id == canonical.id:
                continue
            alias_pages = set(normalize_role_permissions_list(alias.permissions))
            merged_pages = sorted(canonical_pages | alias_pages)

            self.stdout.write(
                f"- Merge role alias {alias.name} -> {canonical.name} "
                f"(pages {len(alias_pages)} into {len(canonical_pages)}; merged {len(merged_pages)}) "
                f"({'APPLY' if apply else 'DRY RUN'})"
            )
            if not apply:
                continue

            with transaction.atomic():
                # Merge permissions into canonical role.
                canonical.permissions = merged_pages
                canonical.save(update_fields=["permissions"])
                canonical_pages = set(merged_pages)

                # Move assignments and avoid duplicates.
                alias_assignments = UserRole.objects.filter(role=alias).select_related("user")
                for ur in alias_assignments:
                    changed_user_ids.add(ur.user_id)
                    UserRole.objects.get_or_create(
                        user_id=ur.user_id,
                        role=canonical,
                        defaults={"assigned_by_id": ur.assigned_by_id},
                    )
                    ur.delete()

                # Keep historical row but deactivate typo role.
                if alias.is_active:
                    alias.is_active = False
                    alias.save(update_fields=["is_active"])

        return changed_user_ids

    def _normalize_role_pages(self, *, apply: bool) -> set[int]:
        changed_user_ids: set[int] = set()
        for role in Role.objects.all().order_by("name"):
            pages = normalize_role_permissions_list(role.permissions)
            updated = list(pages)

            # Diagnosis Review belongs to Medical Records governance path.
            is_doctor_role = role.type == "doctor" or role.name.strip().lower() == "medical doctor"
            if is_doctor_role:
                updated = [p for p in updated if p != "/medical-records/diagnosis-review"]

            for required in REQUIRED_PAGES_BY_ROLE_NAME.get(role.name, ()):
                if required not in updated:
                    updated.append(required)

            if updated == pages:
                continue

            self.stdout.write(
                f"- {role.name}: {len(pages)} -> {len(updated)} page(s) "
                f"({'APPLY' if apply else 'DRY RUN'})"
            )
            if not apply:
                continue

            role.permissions = updated
            role.save(update_fields=["permissions"])
            changed_user_ids.update(
                UserRole.objects.filter(role=role).values_list("user_id", flat=True)
            )

        return changed_user_ids

    def handle(self, *args, **options):
        apply = bool(options.get("apply"))
        changed_user_ids: set[int] = set()

        changed_user_ids |= self._merge_eye_role_aliases(apply=apply)
        changed_user_ids |= self._normalize_role_pages(apply=apply)

        if apply:
            for user_id in sorted(changed_user_ids):
                bump_user_permissions_version(user_id)

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"RBAC canonicalization complete ({'APPLY' if apply else 'DRY RUN'}). "
                f"Users bumped: {len(changed_user_ids) if apply else 0}"
            )
        )
        if not apply:
            self.stdout.write(
                self.style.WARNING("Dry run only. Re-run with --apply to persist changes.")
            )
