"""API smoke tests for physiotherapy orders."""
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom, ConsultationSession
from physiotherapy.models import PhysioOrder


class PhysioOrderApiTests(APITestCase):
    def setUp(self):
        self.doctor = create_test_user("physio_dr", superuser=True)
        self.client.force_authenticate(user=self.doctor)

        self.patient, self.visit = create_test_patient_visit(patient_id="PHYSIO-PT-001")
        self.room = ConsultationRoom.objects.create(name="Physio Room", room_number="PH-R1")
        self.session = ConsultationSession.objects.create(
            room=self.room,
            patient=self.patient,
            visit=self.visit,
            doctor=self.doctor,
            status="active",
        )

    def test_create_physio_order_returns_201(self):
        res = self.client.post(
            "/api/v1/orders/",
            {
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "consultation_session": self.session.pk,
                "history_clinical_findings": "Lower back pain for 2 weeks",
                "diagnosis": "Lumbar strain",
                "drug_history": "None",
                "special_instructions": "Avoid heavy lifting",
                "priority": "high",
                "referral_source": "doctor",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["diagnosis"], "Lumbar strain")
        self.assertEqual(res.data["priority"], "high")
        order = PhysioOrder.objects.get(
            patient=self.patient,
            consultation_session=self.session,
            diagnosis="Lumbar strain",
        )
        self.assertEqual(order.status, "pending")
        self.assertTrue(
            PhysioOrder.objects.filter(
                patient=self.patient,
                consultation_session=self.session,
            ).exists()
        )

    def test_list_physio_orders_filtered_by_consultation_session(self):
        PhysioOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            ordered_by=self.doctor,
            consultation_session=self.session,
            diagnosis="Session order",
            priority="normal",
        )
        PhysioOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            ordered_by=self.doctor,
            consultation_session=None,
            diagnosis="Other order",
            priority="low",
        )

        # Evaluating the paginated result exercises every select_related path
        # used by the consultation-room order lookup.
        res = self.client.get(f"/api/v1/orders/?consultation_session={self.session.pk}&page_size=100")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.data.get("results", res.data)
        diagnoses = [row["diagnosis"] for row in rows]
        self.assertEqual(diagnoses, ["Session order"])

    def test_physio_orders_require_authentication(self):
        self.client.force_authenticate(user=None)
        res = self.client.get("/api/v1/orders/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
