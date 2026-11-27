"""Eye-clinic-owned ICD-10 diagnoses: storage validation and report counting."""
from datetime import date, datetime, time

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ICD10Code
from eyecare.report_pdf import build_eye_session_pdf_bytes
from eyecare.models import EyeOrder, EyeSession
from reports.eye_clinical_diagnosis import build_eye_clinical_diagnosis_report

PERIOD_START = date(2026, 3, 1)
PERIOD_END = date(2026, 3, 31)
REFERRAL_TEXT = "[Primary] I10 - Essential (primary) hypertension"


def _completed_at(month: int, day: int) -> datetime:
    return timezone.make_aware(datetime.combine(date(2026, month, day), time(10, 0)))


class EyeClinicDiagnosisTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        ICD10Code.objects.create(code="H25", description="Senile cataract", category="Eye")
        ICD10Code.objects.create(
            code="I10", description="Essential (primary) hypertension", category="Circulatory"
        )

    def setUp(self):
        self.clinician = create_test_user("eye_clinic", superuser=True)
        self.client.force_authenticate(user=self.clinician)
        self.patient, self.visit = create_test_patient_visit(patient_id="EYE-CLINIC-001")

    def _order(self, **kwargs) -> EyeOrder:
        defaults = {
            "patient": self.patient,
            "visit": self.visit,
            "ordered_by": self.clinician,
            "diagnosis": REFERRAL_TEXT,
        }
        defaults.update(kwargs)
        return EyeOrder.objects.create(**defaults)

    def _session(
        self,
        order: EyeOrder,
        *,
        number: int = 1,
        completed_at: datetime | None = None,
        status: str = "completed",
    ) -> EyeSession:
        return EyeSession.objects.create(
            order=order,
            session_number=number,
            status=status,
            scheduled_at=_completed_at(3, 1),
            completed_at=completed_at or _completed_at(3, 5),
        )

    def test_patch_stores_normalized_clinic_diagnoses(self):
        order = self._order()

        res = self.client.patch(
            f"/api/v1/eyecare/orders/{order.pk}/",
            {"clinic_diagnoses": [{"code": " h25 ", "type": "secondary"}]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        order.refresh_from_db()
        self.assertEqual(
            order.clinic_diagnoses,
            [{"code": "H25", "name": "Senile cataract", "type": "Secondary"}],
        )

    def test_patch_rejects_unknown_icd_code(self):
        order = self._order()

        res = self.client.patch(
            f"/api/v1/eyecare/orders/{order.pk}/",
            {"clinic_diagnoses": [{"code": "ZZZ.9"}]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        order.refresh_from_db()
        self.assertEqual(order.clinic_diagnoses, [])

    def test_report_ignores_the_referring_doctor_diagnosis(self):
        order = self._order(
            clinic_diagnoses=[{"code": "H25", "name": "Senile cataract", "type": "Primary"}]
        )
        self._session(order)

        report = build_eye_clinical_diagnosis_report(PERIOD_START, PERIOD_END)

        self.assertEqual([row["code"] for row in report["data"]], ["H25"])
        self.assertEqual(report["summary"]["uncoded_sessions"], 0)

    def test_report_counts_once_per_completed_session(self):
        order = self._order(
            clinic_diagnoses=[{"code": "H25", "name": "Senile cataract", "type": "Primary"}]
        )
        self._session(order, number=1, completed_at=_completed_at(3, 5))
        self._session(order, number=2, completed_at=_completed_at(3, 6))

        report = build_eye_clinical_diagnosis_report(PERIOD_START, PERIOD_END)

        self.assertEqual(report["data"][0]["count"], 2)
        self.assertEqual(report["summary"]["total_sessions"], 2)

    def test_session_list_and_report_pdf_carry_the_clinic_diagnosis(self):
        order = self._order(
            clinic_diagnoses=[{"code": "H25", "name": "Senile cataract", "type": "Primary"}]
        )
        session = self._session(order)

        res = self.client.get(f"/api/v1/eyecare/sessions/?order={order.pk}&page_size=10")

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        rows = res.data.get("results", res.data)
        self.assertEqual(rows[0]["order_details"]["clinic_diagnoses"][0]["code"], "H25")
        self.assertTrue(build_eye_session_pdf_bytes(session).startswith(b"%PDF"))

    def test_report_counts_sessions_without_a_clinic_diagnosis_separately(self):
        coded = self._order(
            clinic_diagnoses=[{"code": "H25", "name": "Senile cataract", "type": "Primary"}]
        )
        self._session(coded, completed_at=_completed_at(3, 5))
        uncoded = self._order()
        self._session(uncoded, completed_at=_completed_at(3, 6))

        report = build_eye_clinical_diagnosis_report(PERIOD_START, PERIOD_END)

        self.assertEqual([row["code"] for row in report["data"]], ["H25"])
        self.assertEqual(report["summary"]["total_sessions"], 2)
        self.assertEqual(report["summary"]["uncoded_sessions"], 1)
