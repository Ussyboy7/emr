from django.test import TestCase
from rest_framework.test import APIClient

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom, ConsultationSession
from organization.models import Clinic, SystemConfig


class CrossLocationConsultationReportTests(TestCase):
    def test_history_user_can_read_report_data_from_another_clinic(self):
        user = create_test_user("history_report_reader", pages=["/consultation/history"])
        clinic = Clinic.objects.create(name="Other Report Clinic", code="REPORT-OTHER")
        patient, visit = create_test_patient_visit(patient_id="REPORT-PT-001")
        room = ConsultationRoom.objects.create(
            name="Report Room",
            room_number="REPORT-ROOM-1",
            location_clinic=clinic,
        )
        session = ConsultationSession.objects.create(
            session_id="REPORT-SESSION-001",
            room=room,
            patient=patient,
            doctor=user,
            visit=visit,
            location_clinic=clinic,
            status="completed",
        )
        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled", defaults={"value": "true"}
        )

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get(
            f"/api/v1/consultation/sessions/{session.pk}/report-data/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["session"]["id"], session.pk)
        self.assertIn("bundle", response.data)
