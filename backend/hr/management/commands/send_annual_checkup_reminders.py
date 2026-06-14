"""
Send annual check-up due / overdue reminders to HR and employees.

Runs daily via Celery beat. Notifications at 30 days and 7 days before
30 November programme due date, plus overdue alerts to HR.
"""

from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from hr.compliance import build_compliance_rows, programme_due_date
from notifications.services import NotificationService


class Command(BaseCommand):
    help = "Send annual check-up programme reminders (30d / 7d before due, overdue to HR)."

    def handle(self, *args, **options):
        today = timezone.localdate()
        year = today.year
        due = programme_due_date(year)
        rows = build_compliance_rows(year)
        hr_overdue = [r for r in rows if r["compliance_status"] == "overdue"]
        hr_due_soon = [
            r
            for r in rows
            if r["compliance_status"] == "due"
            and (due - today).days in (30, 7)
        ]

        if hr_overdue:
            NotificationService.notify_role(
                role_name="Human Resources Officer",
                title=f"Annual check-ups overdue ({year})",
                message=(
                    f"{len(hr_overdue)} employee(s) have not completed the "
                    f"{year} annual check-up (due {due.strftime('%d %b')})."
                ),
                notification_type="workflow",
                priority="high",
                action_url="/hr/annual-checkups",
                object_type="hr_compliance",
                object_id=str(year),
            )

        if hr_due_soon:
            days_left = (due - today).days
            NotificationService.notify_role(
                role_name="Human Resources Officer",
                title=f"Annual check-ups due in {days_left} days",
                message=(
                    f"{len(hr_due_soon)} employee(s) still due for the {year} "
                    f"annual check-up before {due.strftime('%d %b')}."
                ),
                notification_type="workflow",
                priority="normal",
                action_url="/hr/annual-checkups",
                object_type="hr_compliance",
                object_id=str(year),
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Reminders processed for {year}: overdue={len(hr_overdue)}, "
                f"due_window={len(hr_due_soon)}"
            )
        )
