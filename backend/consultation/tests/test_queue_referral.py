"""Consultation queue and referral API tests."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user, create_test_patient_visit
from consultation.models import ConsultationRoom, ConsultationRoomOccupancy


class ConsultationQueueTest(APITestCase):
    """CRUD /api/v1/consultation/queue/"""

    @classmethod
    def setUpTestData(cls):
        cls.doctor = create_test_user("queue_dr", pages=["/consultation", "/consultation/room"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="Q-PT-01")
        cls.room = ConsultationRoom.objects.create(name="Room 1", room_number="R1")

    def setUp(self):
        self.client.force_authenticate(user=self.doctor)

    def test_add_patient_to_queue(self):
        ConsultationRoomOccupancy.objects.create(
            room=self.room,
            doctor=self.doctor,
            status=ConsultationRoomOccupancy.STATUS_ON_SEAT,
            is_active=True,
        )
        resp = self.client.post("/api/v1/consultation/queue/", {
            "room": self.room.pk,
            "patient": self.patient.pk,
            "visit": self.visit.pk,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_list_queue(self):
        resp = self.client.get(f"/api/v1/consultation/queue/?room={self.room.pk}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_list_queue_empty_room(self):
        resp = self.client.get("/api/v1/consultation/queue/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class ConsultationReferralTest(APITestCase):
    """CRUD /api/v1/consultation/referrals/"""

    @classmethod
    def setUpTestData(cls):
        cls.doctor = create_test_user("ref_dr", pages=["/consultation", "/consultation/room"], system_role="Medical Doctor")
        cls.patient, cls.visit = create_test_patient_visit(patient_id="REF-PT-01")

    def setUp(self):
        self.client.force_authenticate(user=self.doctor)

    def test_create_referral(self):
        resp = self.client.post("/api/v1/consultation/referrals/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "specialty": "Orthopedics",
            "facility": "General Hospital",
            "reason": "Fracture management",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_list_referrals(self):
        resp = self.client.get("/api/v1/consultation/referrals/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_list_stats(self):
        resp = self.client.get("/api/v1/consultation/referrals/list-stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_create_referral_requires_patient(self):
        resp = self.client.post("/api/v1/consultation/referrals/", {
            "specialty": "ENT",
            "facility": "Hospital X",
            "reason": "Hearing loss",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
