"""
Backfill: align ConsultationSession + ConsultationQueue with terminal Visit.status.

Production usage (see also command help):

  # Preview (default)
  DJANGO_SETTINGS_MODULE=emr_backend.settings python manage.py fix_visit_consultation_session_drift

  # Apply
  DJANGO_SETTINGS_MODULE=emr_backend.settings python manage.py fix_visit_consultation_session_drift --apply

Django admin edits to Visit.status bypass the API; run this after bulk corrections.

Bypass note: only VisitViewSet PATCH and consultation session flows call finalize automatically;
wards admission_status updates do not touch Visit.status.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from consultation.models import ConsultationQueue, ConsultationSession
from patients.models import Visit
from patients.workflow import finalize_consultation_artifacts_for_visit


class Command(BaseCommand):
    help = (
        "For visits already marked completed or cancelled, close any remaining active/paused "
        "ConsultationSession rows and deactivate active ConsultationQueue rows for that visit. "
        "Default is dry-run; pass --apply to persist."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist fixes (default is dry-run only).",
        )

    def handle(self, *args, **options):
        apply = options["apply"]
        visit_ids = list(
            Visit.objects.filter(status__in=["completed", "cancelled"]).values_list("id", flat=True)
        )
        total_visits = 0
        total_sessions = 0
        total_queue = 0

        for vid in visit_ids:
            visit = Visit.objects.get(pk=vid)
            terminal = "completed" if visit.status == "completed" else "cancelled"

            open_count = ConsultationSession.objects.filter(
                visit=visit, status__in=["active", "paused"]
            ).count()

            q_count = ConsultationQueue.objects.filter(visit=visit, is_active=True).count()
            if open_count == 0 and q_count == 0:
                continue

            total_visits += 1
            total_sessions += open_count
            total_queue += q_count

            self.stdout.write(
                f"visit_id={visit.id} visit_id_display={visit.visit_id} status={visit.status} "
                f"open_sessions={open_count} active_queue={q_count}"
            )

            if apply:
                with transaction.atomic():
                    summary = finalize_consultation_artifacts_for_visit(
                        visit,
                        session_terminal_status=terminal,
                    )
                self.stdout.write(self.style.SUCCESS(f"  applied: {summary}"))

        self.stdout.write(
            self.style.WARNING(
                f"\nSummary: visits_with_drift={total_visits} sessions_to_fix={total_sessions} "
                f"queue_rows_to_deactivate={total_queue} apply={apply}"
            )
        )
        if not apply:
            self.stdout.write(
                self.style.NOTICE("Dry-run only. Re-run with --apply after review.\n")
            )
