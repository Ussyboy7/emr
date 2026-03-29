"""
Auto-close referrals that are still in "Records acknowledged" from a prior month.

Rules:
- Only status ``approved_for_forms`` with ``approved_at`` before the start of the current month.
- Skips if the latest responsibility form was issued on or after the 1st of this month (doctor
  reissue in the current month — normal workflow moves these to ``records_review`` first, but this
  guards inconsistent data).

Scheduling options:
- **Celery Beat** (recommended if you run `celery beat` — see docker-compose `celery-beat`):
  task `consultation.tasks.close_cleared_referrals_monthly_task`, 02:00 on day 1 each month (app timezone, see `CELERY_TIMEZONE`).
  Set `CELERY_BEAT_REFERRAL_MONTH_CLOSE=false` to disable Beat for this job (e.g. use cron only).
- **Cron** (02:00 on the 1st): `0 2 1 * * cd /path/to/backend && python manage.py close_cleared_referrals_monthly`

Dry run:
  python manage.py close_cleared_referrals_monthly --dry-run
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from audit.services import AuditService
from consultation.models import Referral


class Command(BaseCommand):
    help = "Close month-old Records-acknowledged referrals (scheduled month rollover)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List referrals that would be closed without updating the database.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        now = timezone.now()
        first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        candidates = (
            Referral.objects.filter(
                status="approved_for_forms",
                approved_at__isnull=False,
                approved_at__lt=first_of_month,
            )
            .order_by("id")
        )

        would_close = 0
        for referral in candidates.iterator():
            if not referral.responsibility_forms.exists():
                continue
            last_issue = (
                referral.responsibility_forms.order_by("-issue_date")
                .values_list("issue_date", flat=True)
                .first()
            )
            if last_issue and last_issue >= first_of_month:
                continue

            would_close += 1
            if dry_run:
                self.stdout.write(f"[dry-run] Would close {referral.referral_id} (id={referral.pk})")
                continue

            with transaction.atomic():
                referral.status = "closed"
                referral.closed_at = now
                referral.save(update_fields=["status", "closed_at"])
            try:
                AuditService.log_activity(
                    user=None,
                    action="update",
                    object_type="referral",
                    object_id=str(referral.id),
                    module="consultation",
                    object_repr=f"Referral {referral.referral_id}",
                    description=(
                        f"Auto-closed referral {referral.referral_id} (month-end rule: "
                        f"records acknowledged before {first_of_month.date()})"
                    ),
                    new_values={"status": referral.status, "closed_at": referral.closed_at.isoformat()},
                )
            except Exception:
                pass
            self.stdout.write(self.style.SUCCESS(f"Closed {referral.referral_id}"))

        if dry_run:
            self.stdout.write(self.style.WARNING(f"Dry run: {would_close} referral(s) would be closed."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Closed {would_close} referral(s)."))
