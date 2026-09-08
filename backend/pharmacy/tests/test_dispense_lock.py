"""Soft dispense lock, abandon sweep, and same-visit merge."""
from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from common.tests.support import grant_pages
from patients.models import Patient, Visit
from pharmacy.dispense_lock import (
    claim_dispense_lock,
    find_mergeable_prescription,
    release_dispense_lock,
    sweep_stale_dispense_locks,
)
from pharmacy.models import (
    DispensaryReceiptLine,
    GenericMedication,
    Medication,
    Prescription,
    PrescriptionItem,
)

User = get_user_model()


class DispenseLockApiTests(TestCase):
    def setUp(self):
        self.pharmacist_a = User.objects.create_user(
            username="pharm_lock_a",
            password="testpass123",
            system_role="Pharmacist",
            first_name="Alice",
            last_name="Pharm",
        )
        self.pharmacist_b = User.objects.create_user(
            username="pharm_lock_b",
            password="testpass123",
            system_role="Pharmacist",
            first_name="Bob",
            last_name="Pharm",
        )
        for u in (self.pharmacist_a, self.pharmacist_b):
            grant_pages(u, ["/pharmacy", "/pharmacy/prescriptions"])

        self.client = APIClient()
        self.client.force_authenticate(user=self.pharmacist_a)

        self.patient = Patient.objects.create(
            patient_id="PH-LOCK-001",
            surname="Lock",
            first_name="Patient",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        self.doctor = User.objects.create_user(
            username="pharm_lock_dr",
            password="testpass123",
            system_role="Medical Doctor",
        )
        self.generic = GenericMedication.objects.create(
            name="Amlodipine",
            strength="5mg",
            dosage_form="tablet",
            unit="tablet",
        )
        self.medication = Medication.objects.create(
            name="Amlong 5mg",
            generic=self.generic,
            code="PH-LOCK-MED",
            unit="tablet",
            category="Cardiovascular",
        )
        self.prescription = Prescription.objects.create(
            prescription_id="RX-LOCK-001",
            patient=self.patient,
            doctor=self.doctor,
            created_by=self.doctor,
            status="pending",
        )
        PrescriptionItem.objects.create(
            prescription=self.prescription,
            generic=self.generic,
            medication=self.medication,
            quantity=Decimal("10"),
            unit="tablet",
        )
        DispensaryReceiptLine.objects.create(
            medication=self.medication,
            quantity=Decimal("100"),
            quantity_remaining=Decimal("100"),
            received_at=timezone.now(),
            batch_number="LOCK-BATCH-1",
        )

    def _url(self, action: str) -> str:
        return f"/api/v1/pharmacy/prescriptions/{self.prescription.pk}/{action}/"

    def test_claim_blocks_second_pharmacist(self):
        res = self.client.post(self._url("claim-dispense"), format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "dispensing")
        self.assertTrue(res.data["dispense_lock"]["locked_by_me"])

        self.client.force_authenticate(user=self.pharmacist_b)
        conflict = self.client.post(self._url("claim-dispense"), format="json")
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("Alice", conflict.data["locked_by_name"])

    def test_release_reverts_to_pending(self):
        claim_dispense_lock(self.prescription, self.pharmacist_a)
        res = self.client.post(self._url("release-dispense"), format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.prescription.refresh_from_db()
        self.assertEqual(self.prescription.status, "pending")
        self.assertIsNone(self.prescription.dispensing_by_id)
        self.assertFalse(res.data["dispense_lock"]["locked"])

    def test_sweep_reverts_abandoned_dispensing(self):
        self.prescription.status = "dispensing"
        self.prescription.dispensing_by = None
        self.prescription.dispensing_started_at = timezone.now() - timedelta(hours=1)
        self.prescription.save(
            update_fields=["status", "dispensing_by", "dispensing_started_at"]
        )
        result = sweep_stale_dispense_locks()
        self.assertGreaterEqual(result["reverted_pending"], 1)
        self.prescription.refresh_from_db()
        self.assertEqual(self.prescription.status, "pending")


class SameVisitMergeTests(TestCase):
    def setUp(self):
        self.patient = Patient.objects.create(
            patient_id="PH-MERGE-001",
            surname="Merge",
            first_name="Patient",
            gender="female",
            date_of_birth=date(1985, 5, 5),
        )
        self.doctor = User.objects.create_user(
            username="pharm_merge_dr",
            password="testpass123",
            system_role="Medical Doctor",
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(9, 0),
            visit_type="consultation",
            status="in_progress",
            clinic="General",
        )
        self.generic_a = GenericMedication.objects.create(
            name="Paracetamol",
            strength="500mg",
            dosage_form="tablet",
            unit="tablet",
        )
        self.generic_b = GenericMedication.objects.create(
            name="Ibuprofen",
            strength="400mg",
            dosage_form="tablet",
            unit="tablet",
        )
        self.med_a = Medication.objects.create(
            name="Panadol",
            generic=self.generic_a,
            code="MERGE-A",
            unit="tablet",
        )
        self.med_b = Medication.objects.create(
            name="Brufen",
            generic=self.generic_b,
            code="MERGE-B",
            unit="tablet",
        )
        self.rx = Prescription.objects.create(
            prescription_id="RX-MERGE-001",
            patient=self.patient,
            doctor=self.doctor,
            created_by=self.doctor,
            visit=self.visit,
            status="pending",
        )
        PrescriptionItem.objects.create(
            prescription=self.rx,
            generic=self.generic_a,
            medication=self.med_a,
            quantity=Decimal("10"),
            unit="tablet",
        )

    def test_find_mergeable_same_visit(self):
        found = find_mergeable_prescription(
            patient_id=self.patient.pk,
            visit_id=self.visit.pk,
        )
        self.assertEqual(found.pk, self.rx.pk)

    def test_no_merge_when_locked(self):
        claim_dispense_lock(self.rx, self.doctor)
        found = find_mergeable_prescription(
            patient_id=self.patient.pk,
            visit_id=self.visit.pk,
        )
        self.assertIsNone(found)
        release_dispense_lock(self.rx, self.doctor)

    def test_serializer_appends_items_on_create(self):
        from pharmacy.serializers import PrescriptionSerializer

        serializer = PrescriptionSerializer(
            data={
                "patient": self.patient.pk,
                "doctor": self.doctor.pk,
                "visit": self.visit.pk,
                "items": [
                    {
                        "generic": self.generic_b.pk,
                        "medication": self.med_b.pk,
                        "quantity": "5",
                        "unit": "tablet",
                    }
                ],
            }
        )
        # Stock check in create may fail without receipt lines — add stock first.
        DispensaryReceiptLine.objects.create(
            medication=self.med_b,
            quantity=Decimal("50"),
            quantity_remaining=Decimal("50"),
            received_at=timezone.now(),
            batch_number="MERGE-B-1",
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        result = serializer.save(created_by=self.doctor)
        self.assertEqual(result.pk, self.rx.pk)
        self.assertTrue(getattr(result, "merged_into_existing", False))
        self.assertEqual(self.rx.medications.count(), 2)

    def test_historical_merge_collapses_same_visit_pending(self):
        from pharmacy.dispense_lock import merge_pending_same_visit_prescriptions

        rx2 = Prescription.objects.create(
            prescription_id="RX-MERGE-002",
            patient=self.patient,
            doctor=self.doctor,
            created_by=self.doctor,
            visit=self.visit,
            status="pending",
        )
        PrescriptionItem.objects.create(
            prescription=rx2,
            generic=self.generic_b,
            medication=self.med_b,
            quantity=Decimal("5"),
            unit="tablet",
        )
        result = merge_pending_same_visit_prescriptions()
        self.assertEqual(result["merged_groups"], 1)
        self.assertEqual(result["cancelled"], 1)
        self.rx.refresh_from_db()
        rx2.refresh_from_db()
        self.assertEqual(self.rx.status, "pending")
        self.assertEqual(rx2.status, "cancelled")
        self.assertEqual(self.rx.medications.count(), 2)
