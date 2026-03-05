"""
Print consultation session note fields from the database (for debugging).

Usage (with DB running):
  Local:
    cd emr/backend && python manage.py show_session_notes 4
  Docker (local stack):
    docker exec emr-backend-local python manage.py show_session_notes 4
    docker exec emr-backend-local python manage.py show_session_notes 4 --full
  Options: --full (print full text), --patient "Name" (find by patient name)
"""
from django.core.management.base import BaseCommand

from consultation.models import ConsultationSession


def _preview(s: str, max_len: int = 120) -> str:
    if not s or not s.strip():
        return "(empty)"
    t = (s or "").strip().replace("\n", " ")
    return repr(t[:max_len] + ("..." if len(t) > max_len else ""))


class Command(BaseCommand):
    help = "Print note fields for a consultation session by id (e.g. Session #4 -> id=4)."

    def add_arguments(self, parser):
        parser.add_argument("id", type=int, help="Consultation session id (e.g. 4)")
        parser.add_argument(
            "--patient",
            type=str,
            default=None,
            help="Optional: find by patient name substring (overrides id if given)",
        )
        parser.add_argument("--full", action="store_true", help="Print full text, not preview")

    def handle(self, *args, **options):
        session_id = options["id"]
        patient_substring = options.get("patient")
        full = options.get("full", False)

        if patient_substring:
            from django.db.models import Q
            qs = ConsultationSession.objects.filter(
                Q(patient__surname__icontains=patient_substring)
                | Q(patient__first_name__icontains=patient_substring)
            ).order_by("-started_at")
            sessions = list(qs[:5])
            if not sessions:
                self.stdout.write(self.style.WARNING(f"No sessions found for patient containing '{patient_substring}'."))
                return
            self.stdout.write(f"Found {len(sessions)} session(s) for patient like '{patient_substring}' (showing first 5).\n")
        else:
            try:
                session = ConsultationSession.objects.get(id=session_id)
                sessions = [session]
            except ConsultationSession.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"Session id={session_id} not found."))
                return

        for s in sessions:
            self.stdout.write(f"\n--- Session id={s.id} | {s.session_id} | {s.patient.get_full_name()} | {s.started_at} ---\n")
            self.stdout.write(f"status: {s.status}\n")

            def out(label: str, value: str):
                if full and value:
                    self.stdout.write(f"{label}:\n{value}\n")
                else:
                    self.stdout.write(f"{label}: {_preview(value)}\n")

            out("presentation_complaint", s.presentation_complaint or "")
            out("history_of_presenting_illness", s.history_of_presenting_illness or "")
            out("physical_examination", s.physical_examination or "")
            out("assessment", s.assessment or "")
            out("plan", s.plan or "")
            out("notes", s.notes or "")
