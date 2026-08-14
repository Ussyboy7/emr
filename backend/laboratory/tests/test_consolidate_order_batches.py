from datetime import date, time
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from laboratory.models import LabOrder, LabSampleBatch, LabTest
from organization.models import Clinic
from patients.models import Patient, Visit


class ConsolidateOrderBatchesCommandTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.hq = Clinic.objects.create(name="Headquarters", code="HQ")
        cls.patient = Patient.objects.create(
            patient_id="CONSOLIDATE-SAMPLE-001",
            surname="Consolidate",
            first_name="Sample",
            gender="female",
            date_of_birth=date(1990, 1, 1),
        )
        cls.visit = Visit.objects.create(
            patient=cls.patient,
            date=date.today(),
            time=time(10, 0),
            location_clinic=cls.hq,
            clinic="GOPD",
        )
        cls.order = LabOrder.objects.create(
            order_id="LAB-CONSOLIDATE-001",
            patient=cls.patient,
            visit=cls.visit,
            lab_number="BT-26-1713",
        )

    def _batch(self, accession):
        return LabSampleBatch.objects.create(
            order=self.order,
            collection_clinic=self.hq,
            accession_number=accession,
            collected_at=self._now(),
        )

    @staticmethod
    def _now():
        from django.utils import timezone
        return timezone.now()

    def _test(self, code):
        return LabTest.objects.create(
            order=self.order,
            name=code,
            code=code,
            sample_type="blood",
            lab_number=code,
        )

    def test_dry_run_reports_without_writing(self):
        keep = self._batch("BT-26-1713")
        second = self._batch("BT-26-1714")
        t1 = self._test("FBC")
        t2 = self._test("ESR")
        t1.sample_batch = keep
        t2.sample_batch = second
        t1.save(update_fields=["sample_batch"])
        t2.save(update_fields=["sample_batch"])

        output = StringIO()
        call_command("consolidate_order_batches", "--dry-run", stdout=output)

        self.assertEqual(LabSampleBatch.objects.count(), 2)
        self.assertIn("orders consolidated: 1", output.getvalue())
        self.assertIn("batches merged: 1", output.getvalue())

    def test_apply_merges_onto_earliest_batch(self):
        keep = self._batch("BT-26-1713")
        second = self._batch("BT-26-1714")
        t1 = self._test("FBC")
        t2 = self._test("ESR")
        t1.sample_batch = keep
        t2.sample_batch = second
        t1.lab_number = "BT-26-1713"
        t2.lab_number = "BT-26-1714"
        t1.save(update_fields=["sample_batch", "lab_number"])
        t2.save(update_fields=["sample_batch", "lab_number"])

        call_command("consolidate_order_batches", "--apply")

        t2.refresh_from_db()
        self.assertEqual(LabSampleBatch.objects.count(), 1)
        self.assertEqual(t2.sample_batch_id, keep.pk)
        self.assertEqual(t2.lab_number, "BT-26-1713")

    def test_apply_leaves_single_batch_orders_untouched(self):
        self._batch("BT-26-1713")
        self._test("FBC")

        output = StringIO()
        call_command("consolidate_order_batches", "--apply", stdout=output)

        self.assertEqual(LabSampleBatch.objects.count(), 1)
        self.assertIn("orders consolidated: 0", output.getvalue())
