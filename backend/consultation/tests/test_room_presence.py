"""Consultation room doctor presence and queue gating tests."""
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom, ConsultationRoomOccupancy
from consultation.queue_notifications import notify_doctor_in_room
from consultation.room_presence import ROOM_PRESENCE_STALE_MINUTES, get_active_occupancy
from notifications.models import Notification
from permissions.models import Role, UserRole


class ConsultationRoomPresenceTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor = create_test_user(
            "presence_dr",
            pages=["/consultation", "/consultation/room", "/consultation/start"],
            system_role="Medical Doctor",
        )
        cls.nurse = create_test_user(
            "presence_nurse",
            pages=["/nursing/pool-queue", "/nursing/room-queue"],
            system_role="Nurse",
        )
        cls.supervisor = create_test_user(
            "presence_sup",
            pages=["/nursing/pool-queue", "/nursing/room-queue"],
            system_role="Nurse",
        )
        supervisor_role = Role.objects.create(
            name="presence-supervisor-role",
            type="nursing",
            permissions={
                "pages": ["/nursing/pool-queue", "/nursing/room-queue"],
                "capabilities": ["consultation_queue_override"],
            },
            is_active=True,
        )
        UserRole.objects.create(user=cls.supervisor, role=supervisor_role)
        cls.patient, cls.visit = create_test_patient_visit(patient_id="PRES-PT-01")
        cls.room = ConsultationRoom.objects.create(name="AGM", room_number="AGM1")
        cls.other_room = ConsultationRoom.objects.create(name="CMO", room_number="CMO1")

    def _check_in(self, user, room):
        self.client.force_authenticate(user=user)
        return self.client.post(f"/api/v1/consultation/rooms/{room.pk}/check-in/")

    def test_check_in_sets_on_seat(self):
        resp = self._check_in(self.doctor, self.room)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["accepting_patients"])
        self.assertEqual(resp.data["presence_status"], "on_seat")
        self.assertEqual(resp.data["current_doctor_id"], self.doctor.pk)

    def test_set_accepting_toggle(self):
        self._check_in(self.doctor, self.room)
        resp = self.client.post(
            f"/api/v1/consultation/rooms/{self.room.pk}/set-accepting/",
            {"accepting": False},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["accepting_patients"])
        self.assertEqual(resp.data["presence_status"], "not_accepting")

    def test_check_out_clears_presence(self):
        self._check_in(self.doctor, self.room)
        resp = self.client.post(f"/api/v1/consultation/rooms/{self.room.pk}/check-out/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["accepting_patients"])
        self.assertEqual(resp.data["presence_status"], "away")

    def test_queue_create_blocked_without_doctor(self):
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_queue_create_allowed_when_on_seat(self):
        self._check_in(self.doctor, self.room)
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_queue_create_blocked_for_scheduled_visit(self):
        self._check_in(self.doctor, self.room)
        self.visit.status = "scheduled"
        self.visit.save(update_fields=["status"])
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("visit", resp.data)

    def test_queue_create_blocked_when_not_accepting(self):
        self._check_in(self.doctor, self.room)
        self.client.post(
            f"/api/v1/consultation/rooms/{self.room.pk}/set-accepting/",
            {"accepting": False},
            format="json",
        )
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_queue_create_allowed_when_not_accepting_with_override(self):
        self._check_in(self.doctor, self.room)
        self.client.post(
            f"/api/v1/consultation/rooms/{self.room.pk}/set-accepting/",
            {"accepting": False},
            format="json",
        )
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "override_presence": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_reassign_to_non_accepting_room_blocked(self):
        doctor_b = create_test_user(
            "presence_dr_b",
            pages=["/consultation", "/consultation/room"],
            system_role="Medical Doctor",
        )
        self._check_in(self.doctor, self.room)
        self._check_in(doctor_b, self.other_room)
        self.client.force_authenticate(user=self.nurse)
        create_resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        queue_id = create_resp.data["id"]

        self.client.force_authenticate(user=doctor_b)
        self.client.post(
            f"/api/v1/consultation/rooms/{self.other_room.pk}/set-accepting/",
            {"accepting": False},
            format="json",
        )
        self.client.force_authenticate(user=self.nurse)
        patch_resp = self.client.patch(
            f"/api/v1/consultation/queue/{queue_id}/",
            {"room": self.other_room.pk},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reassign_to_non_accepting_room_allowed_with_override(self):
        doctor_b = create_test_user(
            "presence_dr_c",
            pages=["/consultation", "/consultation/room"],
            system_role="Medical Doctor",
        )
        self._check_in(self.doctor, self.room)
        self._check_in(doctor_b, self.other_room)
        self.client.force_authenticate(user=self.nurse)
        create_resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        queue_id = create_resp.data["id"]

        self.client.force_authenticate(user=doctor_b)
        self.client.post(
            f"/api/v1/consultation/rooms/{self.other_room.pk}/set-accepting/",
            {"accepting": False},
            format="json",
        )
        self.client.force_authenticate(user=self.nurse)
        patch_resp = self.client.patch(
            f"/api/v1/consultation/queue/{queue_id}/",
            {"room": self.other_room.pk, "override_presence": True},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)

    def test_check_in_moves_doctor_from_previous_room(self):
        self._check_in(self.doctor, self.room)
        self._check_in(self.doctor, self.other_room)
        self.assertFalse(
            ConsultationRoomOccupancy.objects.filter(
                room=self.room, is_active=True
            ).exists()
        )
        self.assertTrue(
            ConsultationRoomOccupancy.objects.filter(
                room=self.other_room, doctor=self.doctor, is_active=True
            ).exists()
        )

    def test_heartbeat_refreshes_presence(self):
        self._check_in(self.doctor, self.room)
        resp = self.client.post(f"/api/v1/consultation/rooms/{self.room.pk}/heartbeat/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["presence_status"], "on_seat")

    def test_stale_presence_cleared_on_room_read(self):
        self._check_in(self.doctor, self.room)
        occ = ConsultationRoomOccupancy.objects.get(room=self.room, is_active=True)
        ConsultationRoomOccupancy.objects.filter(pk=occ.pk).update(
            last_seen_at=timezone.now() - timedelta(minutes=ROOM_PRESENCE_STALE_MINUTES + 5),
        )

        self.client.force_authenticate(user=self.nurse)
        resp = self.client.get(f"/api/v1/consultation/rooms/{self.room.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["presence_status"], "away")
        self.assertIsNone(get_active_occupancy(self.room))

    def test_supervisor_override_allows_send_without_doctor(self):
        self.client.force_authenticate(user=self.supervisor)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "override_presence": True,
                "override_reason": "Doctor requested urgent add",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_override_does_not_require_reason(self):
        self.client.force_authenticate(user=self.supervisor)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "override_presence": True,
                "override_reason": "",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_regular_nurse_override_allows_send_without_doctor(self):
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "override_presence": True,
                "override_reason": "Will send anyway",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_nurse_override_without_reason_allows_send_without_doctor(self):
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "override_presence": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_queue_create_still_blocked_without_override_when_no_doctor(self):
        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "override_presence": False,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_queue_notify_targets_only_doctor_in_room(self):
        other_doctor = create_test_user(
            "presence_dr2",
            pages=["/consultation", "/consultation/room"],
            system_role="Medical Doctor",
        )
        self._check_in(self.doctor, self.room)
        Notification.objects.all().delete()

        self.client.force_authenticate(user=self.nurse)
        resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient.pk,
                "visit": self.visit.pk,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Notification.objects.filter(user=self.doctor).count(), 1)
        self.assertEqual(Notification.objects.filter(user=other_doctor).count(), 0)

    def test_queue_notify_skipped_when_no_doctor_in_room(self):
        Notification.objects.all().delete()
        created = notify_doctor_in_room(
            self.room,
            title="Test",
            message="No doctor",
            action_url=f"/consultation/room/{self.room.pk}",
        )
        self.assertEqual(created, 0)
        self.assertEqual(Notification.objects.count(), 0)
