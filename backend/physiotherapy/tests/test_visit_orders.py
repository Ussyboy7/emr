"""Tests for automatic PhysioOrder creation on multi-clinic workflow."""
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom, ConsultationRoomOccupancy
from physiotherapy.models import PhysioOrder


class PhysioOrderFromVisitTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor = create_test_user(
            "physio_flow_dr",
            pages=["/consultation", "/consultation/room", "/consultation/start"],
            system_role="Medical Doctor",
        )
        cls.nurse = create_test_user(
            "physio_flow_nurse",
            pages=["/nursing/pool-queue", "/nursing/room-queue"],
            system_role="Nurse",
        )
        cls.room = ConsultationRoom.objects.create(name="AGM", room_number="AGM-PF1")

    def _check_in(self):
        self.client.force_authenticate(user=self.doctor)
        ConsultationRoomOccupancy.objects.get_or_create(
            room=self.room,
            doctor=self.doctor,
            defaults={"status": ConsultationRoomOccupancy.STATUS_ON_SEAT, "is_active": True},
        )
        return self.client.post(f"/api/v1/consultation/rooms/{self.room.pk}/check-in/")

    def test_queue_and_session_end_create_physio_order(self):
        self._check_in()
        patient, visit = create_test_patient_visit(patient_id="PHYSIO-FLOW-01")
        visit.clinics = ["GOPD", "Physiotherapy"]
        visit.status = "in_progress"
        visit.save()

        self.client.force_authenticate(user=self.nurse)
        q = self.client.post(
            "/api/v1/consultation/queue/",
            {"room": self.room.pk, "patient": patient.pk, "visit": visit.pk},
            format="json",
        )
        self.assertEqual(q.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            PhysioOrder.objects.filter(visit=visit, patient=patient).exists(),
            "Physio order should exist after send to room",
        )

        self.client.force_authenticate(user=self.doctor)
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
        order = PhysioOrder.objects.get(visit=visit, patient=patient)
        self.assertIn(order.status, ("scheduled", "pending", "in_progress"))
