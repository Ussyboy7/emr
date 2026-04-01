from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from consultation.models import ConsultationSession


NOTE_FIELDS = [
    "presentation_complaint",
    "history_of_presenting_illness",
    "physical_examination",
    "assessment",
    "plan",
    "notes",
]


def _text_value(value):
    return (value or "").strip()


def _session_score(session):
    score = 0
    for field in NOTE_FIELDS:
        if _text_value(getattr(session, field, "")):
            score += 1
    return score


class Command(BaseCommand):
    help = (
        "Close duplicate active consultation sessions and keep one canonical session per key "
        "(visit, then patient+room fallback). Use --apply to persist changes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist changes. Without this flag, the command runs in dry-run mode.",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options.get("apply"))
        now = timezone.now()

        active_sessions = list(
            ConsultationSession.objects.filter(status="active")
            .select_related("patient", "room", "visit")
            .order_by("-started_at", "-id")
        )
        if not active_sessions:
            self.stdout.write(self.style.SUCCESS("No active consultation sessions found."))
            return

        groups = defaultdict(list)
        for session in active_sessions:
            if session.visit_id:
                key = ("visit", session.visit_id)
            else:
                key = ("patient_room", session.patient_id, session.room_id)
            groups[key].append(session)

        duplicate_groups = {k: v for k, v in groups.items() if len(v) > 1}
        if not duplicate_groups:
            self.stdout.write(self.style.SUCCESS("No duplicate active consultation sessions found."))
            return

        self.stdout.write(
            self.style.WARNING(
                f"Found {len(duplicate_groups)} duplicate active group(s). "
                f"Mode: {'APPLY' if apply_changes else 'DRY-RUN'}"
            )
        )

        updated_sessions = 0
        closed_sessions = 0

        @transaction.atomic
        def run_cleanup():
            nonlocal updated_sessions, closed_sessions

            for key, sessions in duplicate_groups.items():
                ranked = sorted(
                    sessions,
                    key=lambda s: (_session_score(s), s.started_at or now, s.id),
                    reverse=True,
                )
                keeper = ranked[0]
                duplicates = ranked[1:]

                self.stdout.write(
                    f"\nKey {key}: keep session #{keeper.id} ({keeper.session_id}), close {len(duplicates)} duplicate(s)."
                )

                keeper_changed = False
                for field in NOTE_FIELDS:
                    if _text_value(getattr(keeper, field, "")):
                        continue
                    for dup in duplicates:
                        candidate = _text_value(getattr(dup, field, ""))
                        if candidate:
                            setattr(keeper, field, candidate)
                            keeper_changed = True
                            self.stdout.write(
                                f"  - Fill keeper.{field} from duplicate #{dup.id}"
                            )
                            break

                if keeper_changed:
                    updated_sessions += 1
                    if apply_changes:
                        keeper.save(update_fields=NOTE_FIELDS + ["updated_at"] if hasattr(keeper, "updated_at") else NOTE_FIELDS)

                for dup in duplicates:
                    self.stdout.write(
                        f"  - Close duplicate session #{dup.id} ({dup.session_id})"
                    )
                    closed_sessions += 1
                    if apply_changes:
                        dup.status = "completed"
                        if not dup.ended_at:
                            dup.ended_at = now
                        dup.save(update_fields=["status", "ended_at"])

        run_cleanup()

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    f"\nDry-run complete. Would update {updated_sessions} keeper session(s) and close {closed_sessions} duplicate session(s)."
                )
            )
            self.stdout.write("Re-run with --apply to persist these changes.")
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"\nCleanup complete. Updated {updated_sessions} keeper session(s); closed {closed_sessions} duplicate session(s)."
            )
        )
