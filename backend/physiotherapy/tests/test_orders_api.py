"""API smoke tests for physiotherapy orders."""
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom, ConsultationSession
from physiotherapy.models import PhysioOrder, PhysioSession


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

    def test_complete_order_marks_physio_leg_without_closing_pending_consultation(self):
        self.visit.clinics = ["GOPD", "Physiotherapy"]
        self.visit.status = "in_progress"
        self.visit.save(update_fields=["clinics", "status"])
        order = PhysioOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            ordered_by=self.doctor,
            diagnosis="Lumbar strain",
            status="in_progress",
        )

        res = self.client.post(f"/api/v1/orders/{order.pk}/complete/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.visit.refresh_from_db()
        self.assertEqual(order.status, "completed")
        self.assertIn("Physiotherapy", self.visit.completed_clinics)
        self.assertEqual(self.visit.status, "in_progress")

    def test_generic_patch_cannot_bypass_completion_synchronization(self):
        order = PhysioOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            ordered_by=self.doctor,
            diagnosis="Lumbar strain",
            status="in_progress",
        )

        res = self.client.patch(
            f"/api/v1/orders/{order.pk}/",
            {"status": "completed"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        order.refresh_from_db()
        self.assertEqual(order.status, "in_progress")

    def test_generic_session_patch_cannot_bypass_completion_synchronization(self):
        order = PhysioOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            ordered_by=self.doctor,
            diagnosis="Lumbar strain",
            status="in_progress",
        )
        session = PhysioSession.objects.create(
            order=order,
            physiotherapist=self.doctor,
            status="in_progress",
        )
        res = self.client.patch(
            f"/api/v1/sessions/{session.pk}/",
            {"status": "completed"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        session.refresh_from_db()
        self.assertEqual(session.status, "in_progress")
