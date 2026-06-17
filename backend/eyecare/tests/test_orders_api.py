"""API smoke tests for eye care orders."""
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom, ConsultationSession
from eyecare.models import EyeOrder


class EyeOrderApiTests(APITestCase):
    def setUp(self):
        self.doctor = create_test_user(
            "eye_dr",
            pages=["/consultation", "/eyecare"],
            system_role="Medical Doctor",
        )
        self.client.force_authenticate(user=self.doctor)

        self.patient, self.visit = create_test_patient_visit(patient_id="EYE-PT-001")
        self.room = ConsultationRoom.objects.create(name="Eye Room", room_number="EYE-R1")
        self.session = ConsultationSession.objects.create(
            room=self.room,
            patient=self.patient,
            visit=self.visit,
            doctor=self.doctor,
            status="active",
        )

    def test_create_eye_order_returns_201(self):
        res = self.client.post(
            "/api/v1/eyecare/orders/",
            {
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "consultation_session": self.session.pk,
                "chief_complaint": "Blurred vision",
                "diagnosis": "Refractive error",
                "treatment_plan": "Refraction and glasses",
                "visual_acuity_od": "6/9",
                "priority": "urgent",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["diagnosis"], "Refractive error")
        self.assertEqual(res.data["priority"], "urgent")
        order = EyeOrder.objects.get(
            patient=self.patient,
            consultation_session=self.session,
            diagnosis="Refractive error",
        )
        self.assertEqual(order.status, "pending")
        self.assertTrue(
            EyeOrder.objects.filter(
                patient=self.patient,
                consultation_session=self.session,
            ).exists()
        )

    def test_list_eye_orders_filtered_by_consultation_session(self):
        EyeOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            ordered_by=self.doctor,
            consultation_session=self.session,
            diagnosis="Session eye order",
            priority="routine",
        )
        EyeOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            ordered_by=self.doctor,
            consultation_session=None,
            diagnosis="Walk-in eye order",
            priority="routine",
        )

        res = self.client.get(f"/api/v1/eyecare/orders/?consultation_session={self.session.pk}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.data.get("results", res.data)
        diagnoses = [row["diagnosis"] for row in rows]
        self.assertEqual(diagnoses, ["Session eye order"])

    def test_eye_orders_forbidden_without_page_permission(self):
        outsider = create_test_user("eye_outsider", pages=["/pharmacy"])
        self.client.force_authenticate(user=outsider)
        res = self.client.get("/api/v1/eyecare/orders/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
