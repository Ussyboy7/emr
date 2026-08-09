"""API tests for ConsultationSession CRUD, workflow actions (pause/resume/end), filtering, and auth."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from consultation.models import ConsultationRoom, ConsultationSession
from patients.models import Patient, Visit

User = get_user_model()

BASE_URL = "/api/v1/consultation/sessions/"


class SessionSetupMixin:
    """Shared setUp: user, patient, room, visit — enough to create a session."""

    def setUp(self):
        self.user = User.objects.create_superuser(
            username="sess_dr",
            password="testpass123",
            email="sess_dr@test.local",
            first_name="Session",
            last_name="Doctor",
        )
        self.user2 = User.objects.create_superuser(
            username="sess_dr2",
            password="testpass123",
            email="sess_dr2@test.local",
            first_name="Other",
            last_name="Doctor",
        )
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            patient_id="SESS-PT-001",
            surname="Doe",
            first_name="Jane",
            gender="female",
            date_of_birth=date(1990, 3, 15),
        )
        self.patient2 = Patient.objects.create(
            patient_id="SESS-PT-002",
            surname="Smith",
            first_name="John",
            gender="male",
            date_of_birth=date(1985, 7, 20),
        )

        self.room = ConsultationRoom.objects.create(
            name="Session Room 1",
            room_number="SR-01",
        )
        self.room2 = ConsultationRoom.objects.create(
            name="Session Room 2",
            room_number="SR-02",
        )

        self.client.post(f"/api/v1/consultation/rooms/{self.room.pk}/check-in/")

        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(10, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )
        self.visit2 = Visit.objects.create(
            patient=self.patient2,
            date=date.today(),
            time=time(11, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )

    def _session_payload(self, **overrides):
        defaults = {
            "room": self.room.pk,
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "presentation_complaint": "Headache and fever",
            "notes": "Initial consultation",
        }
        defaults.update(overrides)
        return defaults

    def _create_session(self, **overrides):
        """Persist a ConsultationSession via the ORM (bypasses API)."""
        defaults = {
            "room": self.room,
            "patient": self.patient,
            "doctor": self.user,
            "visit": self.visit,
            "status": "active",
        }
        defaults.update(overrides)
        return ConsultationSession.objects.create(**defaults)


class SessionCreateTests(SessionSetupMixin, APITestCase):
    """POST /api/v1/consultation/sessions/"""

    def test_create_session_returns_201(self):
        resp = self.client.post(BASE_URL, self._session_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["patient"], self.patient.pk)
        self.assertEqual(resp.data["room"], self.room.pk)
        self.assertEqual(resp.data["status"], "active")
        self.assertTrue(resp.data["session_id"].startswith("SESS-"))

    def test_create_auto_generates_session_id(self):
        resp = self.client.post(BASE_URL, self._session_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(resp.data["session_id"])
        self.assertRegex(resp.data["session_id"], r"^SESS-\d{8}-\d{6}$")

    def test_create_assigns_doctor_from_requesting_user(self):
        resp = self.client.post(BASE_URL, self._session_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["doctor"], self.user.pk)

    def test_create_duplicate_returns_existing_session(self):
        """Retrying a create for the same visit returns the existing active session."""
        resp1 = self.client.post(BASE_URL, self._session_payload(), format="json")
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)

        resp2 = self.client.post(BASE_URL, self._session_payload(), format="json")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertTrue(resp2.data.get("resumed"))
        self.assertEqual(resp2.data["id"], resp1.data["id"])

    def test_create_blocked_by_paused_session_returns_409(self):
        """Cannot start a new session when a paused one exists for the same visit."""
        session = self._create_session(status="paused")
        resp = self.client.post(BASE_URL, self._session_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("paused_session_ids", resp.data)

    def test_create_without_required_fields_returns_400(self):
        resp = self.client.post(BASE_URL, {"notes": "incomplete"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class SessionRetrieveTests(SessionSetupMixin, APITestCase):
    """GET /api/v1/consultation/sessions/{id}/"""

    def test_retrieve_session(self):
        session = self._create_session()
        resp = self.client.get(f"{BASE_URL}{session.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], session.pk)
        self.assertEqual(resp.data["patient_name"], self.patient.get_full_name())
        self.assertEqual(resp.data["doctor_name"], self.user.get_full_name())
        self.assertEqual(resp.data["room_name"], self.room.name)

    def test_retrieve_nonexistent_returns_404(self):
        resp = self.client.get(f"{BASE_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_includes_active_duration_seconds(self):
        session = self._create_session()
        resp = self.client.get(f"{BASE_URL}{session.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("active_duration_seconds", resp.data)


class SessionListTests(SessionSetupMixin, APITestCase):
    """GET /api/v1/consultation/sessions/"""

    def setUp(self):
        super().setUp()
        self.session1 = self._create_session()
        self.session2 = self._create_session(
            patient=self.patient2,
            visit=self.visit2,
            doctor=self.user2,
            room=self.room2,
        )

    def test_list_all(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 2)

    def test_filter_by_patient(self):
        resp = self.client.get(BASE_URL, {"patient": self.patient.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["patient"], self.patient.pk)

    def test_filter_by_doctor(self):
        resp = self.client.get(BASE_URL, {"doctor": self.user2.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["doctor"], self.user2.pk)

    def test_filter_by_status(self):
        self.session1.status = "completed"
        self.session1.ended_at = timezone.now()
        self.session1.save(update_fields=["status", "ended_at"])

        resp = self.client.get(BASE_URL, {"status": "completed"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["status"], "completed")

    def test_filter_by_room(self):
        resp = self.client.get(BASE_URL, {"room": self.room2.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["room"], self.room2.pk)

    def test_filter_by_visit(self):
        resp = self.client.get(BASE_URL, {"visit": self.visit.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)

    def test_search_by_patient_name(self):
        resp = self.client.get(BASE_URL, {"search": "Doe"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(len(resp.data["results"]) >= 1)

    def test_ordering_by_started_at(self):
        resp = self.client.get(BASE_URL, {"ordering": "-started_at"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in resp.data["results"]]
        self.assertEqual(ids[0], self.session2.pk)


class SessionUpdateTests(SessionSetupMixin, APITestCase):
    """PATCH /api/v1/consultation/sessions/{id}/"""

    def test_patch_notes(self):
        session = self._create_session()
        resp = self.client.patch(
            f"{BASE_URL}{session.pk}/",
            {"notes": "Updated consultation notes"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["notes"], "Updated consultation notes")

    def test_patch_presentation_complaint(self):
        session = self._create_session()
        resp = self.client.patch(
            f"{BASE_URL}{session.pk}/",
            {"presentation_complaint": "Cough and chest pain"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["presentation_complaint"], "Cough and chest pain")


class SessionPauseTests(SessionSetupMixin, APITestCase):
    """POST /api/v1/consultation/sessions/{id}/pause/"""

    def test_pause_active_session(self):
        session = self._create_session(status="active")
        resp = self.client.post(f"{BASE_URL}{session.pk}/pause/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "paused")
        self.assertIsNotNone(resp.data["paused_at"])

    def test_pause_accumulates_active_seconds(self):
        session = self._create_session(status="active")
        session.last_resumed_at = timezone.now() - timezone.timedelta(seconds=60)
        session.save(update_fields=["last_resumed_at"])

        resp = self.client.post(f"{BASE_URL}{session.pk}/pause/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["active_seconds"], 59)

    def test_pause_already_paused_returns_400(self):
        session = self._create_session(status="paused")
        resp = self.client.post(f"{BASE_URL}{session.pk}/pause/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only active sessions", resp.data["detail"])

    def test_pause_completed_session_returns_400(self):
        session = self._create_session(status="completed")
        resp = self.client.post(f"{BASE_URL}{session.pk}/pause/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pause_cancelled_session_returns_400(self):
        session = self._create_session(status="cancelled")
        resp = self.client.post(f"{BASE_URL}{session.pk}/pause/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class SessionResumeTests(SessionSetupMixin, APITestCase):
    """POST /api/v1/consultation/sessions/{id}/resume/"""

    def test_resume_paused_session(self):
        session = self._create_session(status="paused")
        resp = self.client.post(f"{BASE_URL}{session.pk}/resume/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "active")
        self.assertIsNotNone(resp.data["last_resumed_at"])

    def test_resume_active_session_returns_400(self):
        session = self._create_session(status="active")
        resp = self.client.post(f"{BASE_URL}{session.pk}/resume/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only paused sessions", resp.data["detail"])

    def test_resume_completed_session_returns_400(self):
        session = self._create_session(status="completed")
        resp = self.client.post(f"{BASE_URL}{session.pk}/resume/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_resume_blocked_by_another_active_session_returns_409(self):
        """Cannot resume when another active session exists for the same patient+room."""
        paused = self._create_session(status="paused")
        _blocker = ConsultationSession.objects.create(
            room=self.room,
            patient=self.patient,
            doctor=self.user2,
            visit=None,
            status="active",
        )
        resp = self.client.post(f"{BASE_URL}{paused.pk}/resume/")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("Another active consultation", resp.data["detail"])


class SessionEndTests(SessionSetupMixin, APITestCase):
    """POST /api/v1/consultation/sessions/{id}/end/"""

    def test_end_active_session(self):
        session = self._create_session(status="active")
        resp = self.client.post(f"{BASE_URL}{session.pk}/end/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "completed")
        self.assertIsNotNone(resp.data["ended_at"])

    def test_end_sets_visit_to_completed(self):
        session = self._create_session(status="active")
        resp = self.client.post(f"{BASE_URL}{session.pk}/end/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.visit.refresh_from_db()
        self.assertEqual(self.visit.status, "completed")

    def test_end_paused_session_also_completes(self):
        """The /end/ action doesn't restrict on current status — it always completes."""
        session = self._create_session(status="paused")
        resp = self.client.post(f"{BASE_URL}{session.pk}/end/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "completed")

    def test_end_nonexistent_session_returns_404(self):
        resp = self.client.post(f"{BASE_URL}99999/end/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class SessionWorkflowTransitionTests(SessionSetupMixin, APITestCase):
    """Full lifecycle: create → pause → resume → end."""

    def test_full_lifecycle(self):
        # 1. Start
        resp = self.client.post(BASE_URL, self._session_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        session_id = resp.data["id"]
        self.assertEqual(resp.data["status"], "active")

        # 2. Pause
        resp = self.client.post(f"{BASE_URL}{session_id}/pause/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "paused")

        # 3. Resume
        resp = self.client.post(f"{BASE_URL}{session_id}/resume/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "active")

        # 4. End
        resp = self.client.post(f"{BASE_URL}{session_id}/end/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "completed")
        self.assertIsNotNone(resp.data["ended_at"])

    def test_pause_resume_pause_resume_end(self):
        """Multiple pause/resume cycles before completing."""
        session = self._create_session(status="active")

        for _ in range(2):
            resp = self.client.post(f"{BASE_URL}{session.pk}/pause/")
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            resp = self.client.post(f"{BASE_URL}{session.pk}/resume/")
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

        resp = self.client.post(f"{BASE_URL}{session.pk}/end/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "completed")


class SessionDeleteTests(SessionSetupMixin, APITestCase):
    """DELETE /api/v1/consultation/sessions/{id}/"""

    def test_delete_session(self):
        session = self._create_session()
        resp = self.client.delete(f"{BASE_URL}{session.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ConsultationSession.objects.filter(pk=session.pk).exists())

    def test_delete_nonexistent_returns_404(self):
        resp = self.client.delete(f"{BASE_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class SessionAuthTests(SessionSetupMixin, APITestCase):
    """Unauthenticated requests must be rejected with 401."""

    def test_list_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(BASE_URL, self._session_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_unauthenticated_returns_401(self):
        session = self._create_session()
        self.client.force_authenticate(user=None)
        resp = self.client.get(f"{BASE_URL}{session.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_pause_unauthenticated_returns_401(self):
        session = self._create_session()
        self.client.force_authenticate(user=None)
        resp = self.client.post(f"{BASE_URL}{session.pk}/pause/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_resume_unauthenticated_returns_401(self):
        session = self._create_session()
        self.client.force_authenticate(user=None)
        resp = self.client.post(f"{BASE_URL}{session.pk}/resume/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_end_unauthenticated_returns_401(self):
        session = self._create_session()
        self.client.force_authenticate(user=None)
        resp = self.client.post(f"{BASE_URL}{session.pk}/end/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
