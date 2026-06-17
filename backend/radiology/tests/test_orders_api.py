"""API smoke tests for radiology orders."""
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom, ConsultationSession
from radiology.models import RadiologyOrder


class RadiologyOrderApiTests(APITestCase):
    def setUp(self):
        self.doctor = create_test_user(
            "rad_dr",
            pages=["/consultation", "/radiology"],
            system_role="Medical Doctor",
        )
        self.client.force_authenticate(user=self.doctor)

        self.patient, self.visit = create_test_patient_visit(patient_id="RAD-PT-001")
        self.room = ConsultationRoom.objects.create(name="Rad Room", room_number="RAD-R1")
        self.session = ConsultationSession.objects.create(
            room=self.room,
            patient=self.patient,
            visit=self.visit,
            doctor=self.doctor,
            status="active",
        )

    def test_create_radiology_order_with_studies_returns_201(self):
        res = self.client.post(
            "/api/v1/radiology/orders/",
            {
                "patient": self.patient.pk,
                "visit": self.visit.pk,
                "consultation_session": self.session.pk,
                "priority": "urgent",
                "clinical_notes": "Persistent cough",
                "provisional_diagnosis": "Pneumonia",
                "studies_data": [
                    {
                        "procedure": "Chest X-Ray",
                        "body_part": "Chest",
                        "modality": "X-Ray",
                        "status": "pending",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["priority"], "urgent")
        self.assertEqual(len(res.data["studies"]), 1)
        self.assertEqual(res.data["studies"][0]["procedure"], "Chest X-Ray")
        order = RadiologyOrder.objects.get(pk=res.data["id"])
        self.assertEqual(order.studies.count(), 1)

    def test_list_radiology_orders_filtered_by_consultation_session(self):
        RadiologyOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            doctor=self.doctor,
            consultation_session=self.session,
            priority="routine",
            clinical_notes="Session order",
        )
        RadiologyOrder.objects.create(
            patient=self.patient,
            visit=self.visit,
            doctor=self.doctor,
            consultation_session=None,
            priority="routine",
            clinical_notes="Other order",
        )

        res = self.client.get(f"/api/v1/radiology/orders/?consultation_session={self.session.pk}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.data.get("results", res.data)
        notes = [row["clinical_notes"] for row in rows]
        self.assertEqual(notes, ["Session order"])

    def test_radiology_orders_forbidden_without_page_permission(self):
        outsider = create_test_user("rad_outsider", pages=["/pharmacy"])
        self.client.force_authenticate(user=outsider)
        res = self.client.get("/api/v1/radiology/orders/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
