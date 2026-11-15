from django.test import TestCase
from rest_framework.test import APIClient

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom, ConsultationSession
from organization.models import Clinic, SystemConfig


class CrossLocationConsultationReportTests(TestCase):
    def _create_session(self):
        patient, visit = create_test_patient_visit(patient_id="REPORT-PT-001")
        clinic = Clinic.objects.create(name="Other Report Clinic", code="REPORT-OTHER")
        room = ConsultationRoom.objects.create(
            name="Report Room",
            room_number="REPORT-ROOM-1",
            location_clinic=clinic,
        )
        session = ConsultationSession.objects.create(
            session_id="REPORT-SESSION-001",
            room=room,
            patient=patient,
            doctor=None,
            visit=visit,
            location_clinic=clinic,
            status="completed",
        )
        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled", defaults={"value": "true"}
        )
        return session

    def _report_url(self, session):
        return f"/api/v1/consultation/sessions/{session.pk}/report-data/"

    def test_history_user_can_read_report_data_from_another_clinic(self):
        user = create_test_user("history_report_reader", pages=["/consultation/history"])
        session = self._create_session()

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get(self._report_url(session))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["session"]["id"], session.pk)
        self.assertIn("bundle", response.data)

    def test_patient_records_user_can_read_report_data(self):
        user = create_test_user(
            "patient_records_report_reader",
            pages=["/medical-records/patients"],
        )
        session = self._create_session()

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get(self._report_url(session))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["session"]["id"], session.pk)

    def test_ward_page_user_can_read_report_data(self):
        user = create_test_user("ward_report_reader", pages=["/nursing/wards"])
        session = self._create_session()

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get(self._report_url(session))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["session"]["id"], session.pk)

    def test_user_without_report_page_is_denied(self):
        user = create_test_user("pharmacy_only_report_reader", pages=["/pharmacy"])
        session = self._create_session()

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get(self._report_url(session))

        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_user_is_denied(self):
        session = self._create_session()

        response = APIClient().get(self._report_url(session))

        self.assertEqual(response.status_code, 401)
