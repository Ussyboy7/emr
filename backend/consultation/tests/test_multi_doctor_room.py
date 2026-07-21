"""Multi-doctor consultation room tests (shared queue, claim on start)."""
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationQueue, ConsultationRoom, ConsultationRoomOccupancy, ConsultationSession


class MultiDoctorRoomTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor_a = create_test_user(
            "multi_dr_a",
            pages=["/consultation", "/consultation/room", "/consultation/start"],
            system_role="Medical Doctor",
        )
        cls.doctor_b = create_test_user(
            "multi_dr_b",
            pages=["/consultation", "/consultation/room", "/consultation/start"],
            system_role="Medical Doctor",
        )
        cls.nurse = create_test_user(
            "multi_nurse",
            pages=["/nursing/pool-queue", "/nursing/room-queue"],
            system_role="Nurse",
        )
        cls.patient_one, cls.visit_one = create_test_patient_visit(patient_id="MULTI-PT-01")
        cls.patient_two, cls.visit_two = create_test_patient_visit(patient_id="MULTI-PT-02")
        cls.room = ConsultationRoom.objects.create(
            name="AGM",
            room_number="AGM1",
            capacity=2,
        )

    def _check_in(self, user, room):
        self.client.force_authenticate(user=user)
        return self.client.post(f"/api/v1/consultation/rooms/{room.pk}/check-in/")

    def test_two_doctors_can_check_into_same_room(self):
        resp_a = self._check_in(self.doctor_a, self.room)
        resp_b = self._check_in(self.doctor_b, self.room)
        self.assertEqual(resp_a.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_b.status_code, status.HTTP_200_OK)
        self.assertEqual(
            ConsultationRoomOccupancy.objects.filter(room=self.room, is_active=True).count(),
            2,
        )
        self.assertEqual(len(resp_b.data.get("doctors") or []), 2)

    def test_default_capacity_allows_multiple_doctors(self):
        room = ConsultationRoom.objects.create(name="Default Cap", room_number="DEF1")
        self.assertGreaterEqual(room.capacity, 2)
        resp_a = self._check_in(self.doctor_a, room)
        resp_b = self._check_in(self.doctor_b, room)
        self.assertEqual(resp_a.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_b.status_code, status.HTTP_200_OK)

    def test_third_doctor_blocked_when_room_at_capacity(self):
        self._check_in(self.doctor_a, self.room)
        self._check_in(self.doctor_b, self.room)
        doctor_c = create_test_user(
            "multi_dr_c",
            pages=["/consultation", "/consultation/room"],
            system_role="Medical Doctor",
        )
        resp = self._check_in(doctor_c, self.room)
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_shared_queue_claim_on_session_start(self):
        self._check_in(self.doctor_a, self.room)
        self.client.force_authenticate(user=self.nurse)
        queue_resp = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.assertEqual(queue_resp.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.doctor_a)
        session_resp = self.client.post(
            "/api/v1/consultation/sessions/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.assertEqual(session_resp.status_code, status.HTTP_201_CREATED)
        self.assertFalse(
            ConsultationQueue.objects.filter(
                room=self.room,
                patient=self.patient_one,
                is_active=True,
            ).exists()
        )

    def test_two_doctors_can_consult_different_patients_in_same_room(self):
        self._check_in(self.doctor_a, self.room)
        self._check_in(self.doctor_b, self.room)
        self.client.force_authenticate(user=self.nurse)
        for patient, visit in ((self.patient_one, self.visit_one), (self.patient_two, self.visit_two)):
            resp = self.client.post(
                "/api/v1/consultation/queue/",
                {"room": self.room.pk, "patient": patient.pk, "visit": visit.pk},
                format="json",
            )
            self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.doctor_a)
        resp_a = self.client.post(
            "/api/v1/consultation/sessions/",
            {"room": self.room.pk, "patient": self.patient_one.pk, "visit": self.visit_one.pk},
            format="json",
        )
        self.client.force_authenticate(user=self.doctor_b)
        resp_b = self.client.post(
            "/api/v1/consultation/sessions/",
            {"room": self.room.pk, "patient": self.patient_two.pk, "visit": self.visit_two.pk},
            format="json",
        )
        self.assertEqual(resp_a.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_b.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            ConsultationSession.objects.filter(room=self.room, status="active").count(),
            2,
        )

    def test_second_doctor_cannot_start_same_patient(self):
        self._check_in(self.doctor_a, self.room)
        self._check_in(self.doctor_b, self.room)
        self.client.force_authenticate(user=self.nurse)
        self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.client.force_authenticate(user=self.doctor_a)
        start_a = self.client.post(
            "/api/v1/consultation/sessions/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.assertEqual(start_a.status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(user=self.doctor_b)
        conflict = self.client.post(
            "/api/v1/consultation/sessions/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT)

    def test_room_queue_stats_endpoint(self):
        self._check_in(self.doctor_a, self.room)
        self.client.force_authenticate(user=self.nurse)
        self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.client.force_authenticate(user=self.doctor_a)
        self.client.post(
            "/api/v1/consultation/sessions/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        stats_resp = self.client.get("/api/v1/consultation/rooms/queue-stats/")
        self.assertEqual(stats_resp.status_code, status.HTTP_200_OK)
        room_stats = stats_resp.data["stats"][str(self.room.pk)]
        self.assertGreaterEqual(room_stats["sent_today"], 1)
        self.assertEqual(room_stats["waiting"], 0)
        self.assertGreaterEqual(room_stats["in_consult"], 1)

    def test_sessions_by_visits_returns_open_session_after_queue_claim(self):
        self._check_in(self.doctor_a, self.room)
        self.client.force_authenticate(user=self.nurse)
        self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.client.force_authenticate(user=self.doctor_a)
        session_resp = self.client.post(
            "/api/v1/consultation/sessions/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.assertEqual(session_resp.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.nurse)
        by_visits = self.client.get(
            f"/api/v1/consultation/sessions/by-visits/?visit_ids={self.visit_one.pk}"
        )
        self.assertEqual(by_visits.status_code, status.HTTP_200_OK)
        results = by_visits.data.get("results") or []
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["visit"], self.visit_one.pk)
        self.assertEqual(results[0]["room_name"], self.room.name)
        self.assertIn(results[0]["status"], ("active", "paused"))

        queue_by_visits = self.client.get(
            f"/api/v1/consultation/queue/by-visits/?visit_ids={self.visit_one.pk}"
        )
        self.assertEqual(queue_by_visits.status_code, status.HTTP_200_OK)
        self.assertEqual(queue_by_visits.data.get("results") or [], [])

    def test_nurse_cannot_requeue_patient_already_in_consultation(self):
        self._check_in(self.doctor_a, self.room)
        self.client.force_authenticate(user=self.nurse)
        self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.client.force_authenticate(user=self.doctor_a)
        start_resp = self.client.post(
            "/api/v1/consultation/sessions/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.assertEqual(start_resp.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.nurse)
        requeue = self.client.post(
            "/api/v1/consultation/queue/",
            {
                "room": self.room.pk,
                "patient": self.patient_one.pk,
                "visit": self.visit_one.pk,
            },
            format="json",
        )
        self.assertEqual(requeue.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            ConsultationQueue.objects.filter(
                room=self.room,
                patient=self.patient_one,
                is_active=True,
            ).exists()
        )

    def test_multi_clinic_session_end_marks_clinic_not_whole_visit(self):
        """GOPD+Physio visit stays in_progress when only GOPD consult ends."""
        self._check_in(self.doctor_a, self.room)
        patient, visit = create_test_patient_visit(patient_id="MULTI-LEG-01")
        visit.clinics = ["GOPD", "Physiotherapy"]
        visit.status = "in_progress"
        visit.save()

        self.client.force_authenticate(user=self.nurse)
        self.client.post(
            "/api/v1/consultation/queue/",
            {"room": self.room.pk, "patient": patient.pk, "visit": visit.pk},
            format="json",
        )
        self.client.force_authenticate(user=self.doctor_a)
        session_resp = self.client.post(
            "/api/v1/consultation/sessions/",
            {"room": self.room.pk, "patient": patient.pk, "visit": visit.pk},
            format="json",
        )
        self.assertEqual(session_resp.status_code, status.HTTP_201_CREATED)
        session_id = session_resp.data["id"]

        end_resp = self.client.post(f"/api/v1/consultation/sessions/{session_id}/end/")
        self.assertEqual(end_resp.status_code, status.HTTP_200_OK)

        visit.refresh_from_db()
        self.assertEqual(visit.status, "in_progress")
        self.assertIn("GOPD", visit.completed_clinics)
        self.assertNotIn("Physiotherapy", visit.completed_clinics)

        from physiotherapy.models import PhysioOrder

        self.assertTrue(
            PhysioOrder.objects.filter(visit=visit, patient=patient).exists(),
            "Physio order must exist after GOPD consult ends on GOPD+Physio visit",
        )
