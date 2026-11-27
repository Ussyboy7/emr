"""Physiotherapist-owned ICD-10 diagnoses: storage validation and report counting."""
from datetime import date, datetime, time

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from common.session_report_pdf import build_physio_session_pdf_bytes
from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ICD10Code
from physiotherapy.models import PhysioOrder, PhysioSession
from reports.physio_clinical_diagnosis import build_physio_clinical_diagnosis_report

PERIOD_START = date(2026, 3, 1)
PERIOD_END = date(2026, 3, 31)
REFERRAL_TEXT = "[Primary] I10 - Essential (primary) hypertension"


def _completed_at(month: int, day: int) -> datetime:
    return timezone.make_aware(datetime.combine(date(2026, month, day), time(10, 0)))


class PhysioClinicDiagnosisTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        ICD10Code.objects.create(
            code="M17", description="Osteoarthritis of knee", category="Musculoskeletal"
        )
        ICD10Code.objects.create(
            code="I10", description="Essential (primary) hypertension", category="Circulatory"
        )

    def setUp(self):
        self.physio = create_test_user("physio_clinic", superuser=True)
        self.client.force_authenticate(user=self.physio)
        self.patient, self.visit = create_test_patient_visit(patient_id="PHYSIO-CLINIC-001")

    def _order(self, **kwargs) -> PhysioOrder:
        defaults = {
            "patient": self.patient,
            "visit": self.visit,
            "ordered_by": self.physio,
            "diagnosis": REFERRAL_TEXT,
        }
        defaults.update(kwargs)
        return PhysioOrder.objects.create(**defaults)

    def _session(
        self,
        order: PhysioOrder,
        *,
        number: int = 1,
        completed_at: datetime | None = None,
        status: str = "completed",
    ) -> PhysioSession:
        return PhysioSession.objects.create(
            order=order,
            physiotherapist=self.physio,
            session_number=number,
            status=status,
            completed_at=completed_at or _completed_at(3, 5),
        )

    def test_patch_stores_normalized_clinic_diagnoses(self):
        order = self._order()

        res = self.client.patch(
            f"/api/v1/orders/{order.pk}/",
            {"clinic_diagnoses": [{"code": " m17 ", "type": "secondary"}]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        order.refresh_from_db()
        self.assertEqual(
            order.clinic_diagnoses,
            [{"code": "M17", "name": "Osteoarthritis of knee", "type": "Secondary"}],
        )

    def test_patch_rejects_unknown_icd_code(self):
        order = self._order()

        res = self.client.patch(
            f"/api/v1/orders/{order.pk}/",
            {"clinic_diagnoses": [{"code": "ZZZ.9"}]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        order.refresh_from_db()
        self.assertEqual(order.clinic_diagnoses, [])

    def test_report_ignores_the_referring_doctor_diagnosis(self):
        order = self._order(
            clinic_diagnoses=[{"code": "M17", "name": "Osteoarthritis of knee", "type": "Primary"}]
        )
        self._session(order)

        report = build_physio_clinical_diagnosis_report(PERIOD_START, PERIOD_END)

        self.assertEqual([row["code"] for row in report["data"]], ["M17"])
        self.assertEqual(report["summary"]["uncoded_sessions"], 0)

    def test_report_counts_once_per_completed_session(self):
        order = self._order(
            clinic_diagnoses=[{"code": "M17", "name": "Osteoarthritis of knee", "type": "Primary"}]
        )
        self._session(order, number=1, completed_at=_completed_at(3, 5))
        self._session(order, number=2, completed_at=_completed_at(3, 6))

        report = build_physio_clinical_diagnosis_report(PERIOD_START, PERIOD_END)

        self.assertEqual(report["data"][0]["count"], 2)
        self.assertEqual(report["summary"]["total_sessions"], 2)

    def test_report_counts_sessions_without_a_clinic_diagnosis_separately(self):
        coded = self._order(
            clinic_diagnoses=[{"code": "M17", "name": "Osteoarthritis of knee", "type": "Primary"}]
        )
        self._session(coded, completed_at=_completed_at(3, 5))
        uncoded = self._order()
        self._session(uncoded, completed_at=_completed_at(3, 6))

        report = build_physio_clinical_diagnosis_report(PERIOD_START, PERIOD_END)

        self.assertEqual([row["code"] for row in report["data"]], ["M17"])
        self.assertEqual(report["summary"]["total_sessions"], 2)
        self.assertEqual(report["summary"]["uncoded_sessions"], 1)

    def test_session_list_and_report_pdf_carry_the_clinic_diagnosis(self):
        order = self._order(
            clinic_diagnoses=[{"code": "M17", "name": "Osteoarthritis of knee", "type": "Primary"}]
        )
        session = self._session(order)

        res = self.client.get(f"/api/v1/sessions/?order={order.pk}&page_size=10")

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        rows = res.data.get("results", res.data)
        self.assertEqual(rows[0]["order_details"]["clinic_diagnoses"][0]["code"], "M17")
        self.assertTrue(build_physio_session_pdf_bytes(session).startswith(b"%PDF"))

    def test_report_skips_sessions_outside_the_period(self):
        order = self._order(
            clinic_diagnoses=[{"code": "M17", "name": "Osteoarthritis of knee", "type": "Primary"}]
        )
        self._session(order, number=1, completed_at=_completed_at(3, 5))
        self._session(order, number=2, completed_at=_completed_at(4, 5))

        report = build_physio_clinical_diagnosis_report(PERIOD_START, PERIOD_END)

        self.assertEqual(report["data"][0]["count"], 1)
        self.assertEqual(report["summary"]["total_sessions"], 1)
