from datetime import date, time
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from laboratory.models import LabOrder, LabSampleBatch, LabTest
from organization.models import Clinic
from patients.models import Patient, Visit


class BackfillSampleBatchesCommandTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.hq = Clinic.objects.create(name="Headquarters", code="HQ")
        cls.patient = Patient.objects.create(
            patient_id="BACKFILL-SAMPLE-001",
            surname="Backfill",
            first_name="Sample",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )

    def _order_with_test(self, *, visit=None, accession=None):
        order = LabOrder.objects.create(
            order_id=f"LAB-BACKFILL-{LabOrder.objects.count() + 1:03d}",
            patient=self.patient,
            visit=visit,
            lab_number=accession,
        )
        LabTest.objects.create(
            order=order,
            name="Full Blood Count",
            code=f"FBC-{order.pk}",
            sample_type="blood",
            lab_number=accession,
        )
        return order

    def test_dry_run_preserves_existing_accession_without_writing(self):
        visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(10, 0),
            location_clinic=self.hq,
            clinic="GOPD",
        )
        order = self._order_with_test(visit=visit, accession="BT-26-0042")
        output = StringIO()

        call_command("backfill_sample_batches", "--dry-run", stdout=output)

        test = order.tests.get()
        self.assertEqual(test.lab_number, "BT-26-0042")
        self.assertIsNone(test.sample_batch_id)
        self.assertEqual(LabSampleBatch.objects.count(), 0)
        self.assertIn("created: 1", output.getvalue())
        self.assertIn("preserved: 1", output.getvalue())

    def test_apply_creates_batch_from_known_visit_origin(self):
        visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(10, 0),
            location_clinic=self.hq,
            clinic="GOPD",
        )
        order = self._order_with_test(visit=visit)

        call_command("backfill_sample_batches", "--apply")

        test = order.tests.get()
        self.assertIsNotNone(test.sample_batch_id)
        self.assertEqual(test.sample_batch.collection_clinic_id, self.hq.id)
        self.assertTrue(test.sample_batch.accession_number.startswith("HQ-"))
        self.assertEqual(test.lab_number, test.sample_batch.accession_number)

    def test_apply_rechecks_locked_order_before_creating_batch(self):
        visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(10, 0),
            location_clinic=self.hq,
            clinic="GOPD",
        )
        order = self._order_with_test(visit=visit)
        original_select_for_update = LabOrder.objects.select_for_update
        inserted = False

        def insert_batch_before_locked_read(*args, **kwargs):
            nonlocal inserted
            if not inserted:
                inserted = True
                batch = LabSampleBatch.objects.create(
                    order=order,
                    collection_clinic=self.hq,
                    accession_number="HQ-26-0042",
                )
                test = order.tests.get()
                test.sample_batch = batch
                test.lab_number = batch.accession_number
                test.save(update_fields=["sample_batch", "lab_number"])
            return original_select_for_update(*args, **kwargs)

        with patch.object(
            LabOrder.objects,
            "select_for_update",
            side_effect=insert_batch_before_locked_read,
        ):
            output = StringIO()
            call_command("backfill_sample_batches", "--apply", stdout=output)

        self.assertEqual(LabSampleBatch.objects.filter(order=order).count(), 1)
        self.assertIn("created: 0", output.getvalue())
        self.assertIn("skipped: 1", output.getvalue())

    def test_dry_run_reports_ambiguous_order_without_guessing(self):
        order = self._order_with_test()
        output = StringIO()

        call_command("backfill_sample_batches", "--dry-run", stdout=output)

        test = order.tests.get()
        self.assertIsNone(test.sample_batch_id)
        self.assertIn("ambiguous: 1", output.getvalue())
        self.assertIn(order.order_id, output.getvalue())
