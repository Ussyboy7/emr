"""Auto-archive old read notifications.

Run this either:

  * Manually:           ``python manage.py cleanup_notifications``
  * On a cron schedule: ``0 3 * * * python manage.py cleanup_notifications``
  * Automatically:      ``NotificationViewSet.list`` invokes this once
                        per 24h via a cache-gated trigger, so even
                        without external scheduling the inbox is
                        bounded.

Behaviour
---------
For each user with notifications, the command reads their
``NotificationPreferences.auto_archive_days`` (defaults to 30 if no
preferences row exists) and bulk-archives ``status='read'`` notifications
whose ``read_at`` (or ``created_at`` for legacy rows) is older than that
window. Setting ``auto_archive_days = 0`` disables auto-archive for that
user.

``--days`` overrides the per-user setting and applies a single window to
everyone — useful for one-off catch-up runs.

``--dry-run`` reports what would be archived without writing.
"""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from notifications.models import Notification, NotificationPreferences


DEFAULT_AUTO_ARCHIVE_DAYS = 30


class Command(BaseCommand):
    help = "Archive read notifications older than each user's auto_archive_days."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=None,
            help=(
                "Override per-user setting; archive any read notification "
                "older than this many days regardless of user prefs."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be archived without writing.",
        )

    def handle(self, *args, **options):
        override_days: int | None = options.get("days")
        dry_run: bool = bool(options.get("dry_run"))
        now = timezone.now()

        archived_total = 0

        if override_days is not None:
            # Global window — one query covers everyone.
            cutoff = now - timedelta(days=override_days)
            qs = Notification.objects.filter(
                status="read",
            ).filter(Q(read_at__lt=cutoff) | Q(read_at__isnull=True, created_at__lt=cutoff))
            count = qs.count()
            self.stdout.write(
                f"Override window: {override_days} days → {count} read notifications older than {cutoff.isoformat()}",
            )
            if not dry_run and count:
                archived_total = qs.update(status="archived")
        else:
            # Per-user windows — fetch each user's pref and bulk-update.
            prefs_by_user = {
                p.user_id: p.auto_archive_days
                for p in NotificationPreferences.objects.all().only("user_id", "auto_archive_days")
            }
            # Override Meta.ordering=['-created_at']; otherwise the
            # implicit ORDER BY pollutes DISTINCT and we iterate once
            # per notification row instead of once per user.
            user_ids = (
                Notification.objects.order_by("user_id")
                .values_list("user_id", flat=True)
                .distinct()
            )
            for user_id in user_ids:
                days = prefs_by_user.get(user_id, DEFAULT_AUTO_ARCHIVE_DAYS)
                if days <= 0:
                    continue
                cutoff = now - timedelta(days=days)
                qs = Notification.objects.filter(
                    user_id=user_id,
                    status="read",
                ).filter(Q(read_at__lt=cutoff) | Q(read_at__isnull=True, created_at__lt=cutoff))
                count = qs.count()
                if not count:
                    continue
                self.stdout.write(
                    f"  user {user_id}: window {days}d, {count} eligible",
                )
                if not dry_run:
                    archived_total += qs.update(status="archived")

        suffix = " (dry-run)" if dry_run else ""
        self.stdout.write(self.style.SUCCESS(
            f"Archived {archived_total} notifications{suffix}.",
        ))


# Re-exported so the self-trigger on the list view can call the same
# code path without spawning a subprocess.
def archive_old_read_notifications(now=None) -> int:
    """Run the per-user auto-archive pass in-process. Returns count."""
    now = now or timezone.now()
    prefs_by_user = {
        p.user_id: p.auto_archive_days
        for p in NotificationPreferences.objects.all().only("user_id", "auto_archive_days")
    }
    total = 0
    user_ids = (
        Notification.objects.order_by("user_id")
        .values_list("user_id", flat=True)
        .distinct()
    )
    for user_id in user_ids:
        days = prefs_by_user.get(user_id, DEFAULT_AUTO_ARCHIVE_DAYS)
        if days <= 0:
            continue
        cutoff = now - timedelta(days=days)
        total += (
            Notification.objects.filter(user_id=user_id, status="read")
            .filter(Q(read_at__lt=cutoff) | Q(read_at__isnull=True, created_at__lt=cutoff))
            .update(status="archived")
        )
    return total
