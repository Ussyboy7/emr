"""Tests for Medical Records diagnosis coding correction workflow."""
from datetime import date, datetime, time, timezone as dt_timezone

from django.contrib.auth import get_user_model
from permissions.models import Role, UserRole
from rest_framework import status
from rest_framework.test import APITestCase

from consultation.models import (
    ConsultationRoom,
    ConsultationSession,
    Diagnosis,
    ICD10Code,
)
from patients.models import Patient, Visit

User = get_user_model()

BASE_URL = "/api/v1/consultation/diagnoses/"
REVIEW_URL = f"{BASE_URL}review/"


class DiagnosisCorrectionSetupMixin:
    def setUp(self):
        self.doctor = User.objects.create_user(
            username="corr_doctor",
            password="testpass123",
            email="corr_doctor@test.local",
            first_name="Corr",
            last_name="Doctor",
        )
        self.records_user = User.objects.create_user(
            username="corr_records",
            password="testpass123",
            email="corr_records@test.local",
            first_name="Corr",
            last_name="Records",
        )
        records_role = Role.objects.create(
            name="Records Corrector",
            type="records",
            permissions=[
                "/medical-records",
                "/medical-records/diagnosis-review",
            ],
            is_active=True,
        )
        UserRole.objects.create(user=self.records_user, role=records_role)

        self.patient = Patient.objects.create(
            patient_id="CORR-PT-001",
            surname="Patient",
            first_name="Test",
            gender="female",
            date_of_birth=date(1990, 1, 1),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(9, 0),
            status="completed",
            visit_type="consultation",
            clinic="GOPD",
        )
        self.room = ConsultationRoom.objects.create(name="Corr Room", room_number="CR-1")
        self.session = ConsultationSession.objects.create(
            visit=self.visit,
            patient=self.patient,
            room=self.room,
            doctor=self.doctor,
            status="completed",
            started_at=datetime.now(dt_timezone.utc),
            ended_at=datetime.now(dt_timezone.utc),
        )
        self.icd_wrong = ICD10Code.objects.create(
            code="J00",
            description="Acute nasopharyngitis",
            category="Respiratory",
            is_active=True,
        )
        self.icd_right = ICD10Code.objects.create(
            code="J06.9",
            description="Acute upper respiratory infection",
            category="Respiratory",
            is_active=True,
        )
        self.diagnosis = Diagnosis.objects.create(
            patient=self.patient,
            visit=self.visit,
            session=self.session,
            icd10_code=self.icd_wrong,
            diagnosed_by=self.doctor,
            status="confirmed",
            certainty="confirmed",
        )


class DiagnosisReviewListTests(DiagnosisCorrectionSetupMixin, APITestCase):
    def test_review_requires_permission(self):
        self.client.force_authenticate(user=self.doctor)
        resp = self.client.get(REVIEW_URL)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_review_lists_completed_session_diagnoses(self):
        self.client.force_authenticate(user=self.records_user)
        resp = self.client.get(REVIEW_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in resp.data["results"]]
        self.assertIn(self.diagnosis.id, ids)

    def test_review_excludes_in_progress_sessions(self):
        self.session.status = "active"
        self.session.save(update_fields=["status"])
        self.client.force_authenticate(user=self.records_user)
        resp = self.client.get(REVIEW_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 0)


class DiagnosisCorrectTests(DiagnosisCorrectionSetupMixin, APITestCase):
    def test_correct_updates_code_and_preserves_original(self):
        self.client.force_authenticate(user=self.records_user)
        resp = self.client.post(
            f"{BASE_URL}{self.diagnosis.id}/correct/",
            {
                "icd10_code": self.icd_right.id,
                "reason": "wrong_code",
                "notes": "Doctor picked common cold instead of URI",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.diagnosis.refresh_from_db()
        self.assertEqual(self.diagnosis.icd10_code_id, self.icd_right.id)
        self.assertEqual(self.diagnosis.original_icd10_code_id, self.icd_wrong.id)
        self.assertEqual(self.diagnosis.corrected_by_id, self.records_user.id)
        self.assertEqual(self.diagnosis.correction_reason, "wrong_code")
        self.assertEqual(resp.data["icd10_code_details"]["code"], "J06.9")
        self.assertEqual(resp.data["original_icd10_code_details"]["code"], "J00")

    def test_correct_requires_permission(self):
        self.client.force_authenticate(user=self.doctor)
        resp = self.client.post(
            f"{BASE_URL}{self.diagnosis.id}/correct/",
            {"icd10_code": self.icd_right.id, "reason": "wrong_code"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_correct_rejects_same_code(self):
        self.client.force_authenticate(user=self.records_user)
        resp = self.client.post(
            f"{BASE_URL}{self.diagnosis.id}/correct/",
            {"icd10_code": self.icd_wrong.id, "reason": "wrong_code"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_correct_rejects_in_progress_session(self):
        self.session.status = "active"
        self.session.save(update_fields=["status"])
        self.client.force_authenticate(user=self.records_user)
        resp = self.client.post(
            f"{BASE_URL}{self.diagnosis.id}/correct/",
            {"icd10_code": self.icd_right.id, "reason": "wrong_code"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_correct_rejects_duplicate_visit_code(self):
        Diagnosis.objects.create(
            patient=self.patient,
            visit=self.visit,
            session=self.session,
            icd10_code=self.icd_right,
            diagnosed_by=self.doctor,
        )
        self.client.force_authenticate(user=self.records_user)
        resp = self.client.post(
            f"{BASE_URL}{self.diagnosis.id}/correct/",
            {"icd10_code": self.icd_right.id, "reason": "wrong_code"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
