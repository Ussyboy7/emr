from datetime import date, time

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_user
from consultation.models import ConsultationRoom, ConsultationSession
from laboratory.models import LabOrder
from organization.models import Clinic, SystemConfig
from patients.models import Patient, Visit


class LabOrderLocationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        SystemConfig.objects.update_or_create(key="multi_clinic_enabled", defaults={"value": "true"})
        cls.hq = Clinic.objects.create(name="Headquarters", code="HQ")
        cls.processing = Clinic.objects.create(name="Bode Thomas", code="BODE")
        cls.tin_can = Clinic.objects.create(
            name="Tin Can", code="TIN-CAN", default_processing_clinic=cls.processing
        )
        cls.user = create_test_user(
            "lab_location_user", pages=["/laboratory"], system_role="Medical Doctor"
        )
        cls.user.location_clinic = cls.processing
        cls.user.active_clinic = cls.processing
        cls.user.save(update_fields=["location_clinic", "active_clinic"])
        cls.user.location_clinics.add(cls.processing, cls.tin_can)
        cls.patient = Patient.objects.create(
            patient_id="LAB-LOCATION-01",
            surname="Location",
            first_name="Lab",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        cls.visit = Visit.objects.create(
            patient=cls.patient,
            visit_id="VISIT-LAB-LOCATION-01",
            date=date.today(),
            time=time(10, 0),
            location_clinic=cls.tin_can,
        )
        cls.room = ConsultationRoom.objects.create(
            name="Bode Room",
            room_number="LAB-LOCATION-ROOM",
            location_clinic=cls.processing,
        )
        cls.session = ConsultationSession.objects.create(
            session_id="SESSION-LAB-LOCATION-01",
            room=cls.room,
            patient=cls.patient,
            doctor=cls.user,
            visit=cls.visit,
        )

    def setUp(self):
        self.client.force_authenticate(self.user)

    def test_visit_origin_wins_over_active_clinic_and_routes_processing(self):
        response = self.client.post(
            "/api/v1/laboratory/orders/",
            {
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "consultation_session": self.session.pk,
                "tests_data": [{"name": "FBC", "code": "FBC", "sample_type": "Blood"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        order = LabOrder.objects.get(pk=response.data["id"])
        self.assertEqual(order.location_clinic, self.tin_can)
        self.assertEqual(order.processing_clinic, self.processing)
        self.assertEqual(response.data["location_clinic_name"], "Tin Can")
        self.assertEqual(response.data["processing_clinic_name"], "Bode Thomas")

    def test_unauthorized_visit_origin_is_rejected(self):
        unauthorized_user = create_test_user(
            "lab_location_unauthorized", pages=["/laboratory"], system_role="Medical Doctor"
        )
        unauthorized_user.location_clinic = self.processing
        unauthorized_user.active_clinic = self.processing
        unauthorized_user.save(update_fields=["location_clinic", "active_clinic"])
        unauthorized_user.location_clinics.add(self.processing)
        self.client.force_authenticate(unauthorized_user)

        response = self.client.post(
            "/api/v1/laboratory/orders/",
            {
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "consultation_session": self.session.pk,
                "tests_data": [{"name": "FBC", "code": "FBC", "sample_type": "Blood"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("processing_clinic", response.data)

    def test_order_without_encounter_origin_remains_unassigned_and_visible_to_triage(self):
        response = self.client.post(
            "/api/v1/laboratory/orders/",
            {
                "patient": self.patient.pk,
                "tests_data": [{"name": "FBC", "code": "FBC-NO-VISIT", "sample_type": "Blood"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        order = LabOrder.objects.get(pk=response.data["id"])
        self.assertIsNone(order.location_clinic_id)
        self.assertIsNone(order.processing_clinic_id)

        listed = self.client.get("/api/v1/laboratory/orders/")
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(order.pk, [row["id"] for row in listed.data["results"]])

    def test_generic_patch_cannot_change_order_origin(self):
        order = LabOrder.objects.create(
            order_id="LAB-LOCATION-PATCH-01",
            patient=self.patient,
            location_clinic=self.tin_can,
            processing_clinic=self.processing,
        )

        response = self.client.patch(
            f"/api/v1/laboratory/orders/{order.pk}/",
            {"location_clinic": self.processing.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        order.refresh_from_db()
        self.assertEqual(order.location_clinic_id, self.tin_can.pk)


class LabOrderLocationUnitTests(TestCase):
    def test_visit_precedes_session_and_room(self):
        from common.order_location import resolve_order_origin_clinic

        visit = type("VisitStub", (), {"location_clinic": "visit"})()
        session = type(
            "SessionStub",
            (),
            {"location_clinic": "session", "room": type("RoomStub", (), {"location_clinic": "room"})()},
        )()

        self.assertEqual(resolve_order_origin_clinic(visit=visit, session=session), "visit")

    def test_apply_uses_session_linked_visit_when_visit_is_omitted(self):
        from common.order_location import apply_order_location_clinic

        visit = type("VisitStub", (), {"location_clinic": "visit"})()
        session = type(
            "SessionStub",
            (),
            {
                "location_clinic": None,
                "visit": visit,
                "room": type("RoomStub", (), {"location_clinic": "room"})(),
            },
        )()

        validated = apply_order_location_clinic({"consultation_session": session})

        self.assertEqual(validated["location_clinic"], "visit")
