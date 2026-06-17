"""Nursing Procedure tests — model creation, updates, status changes, API."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from common.tests.support import grant_pages
from nursing.models import NursingOrder, Procedure
from patients.models import Patient, Visit

User = get_user_model()


class ProcedureModelTest(TestCase):
    """Model-level tests for the Procedure model."""

    @classmethod
    def setUpTestData(cls):
        cls.nurse = User.objects.create_user(
            username="proc_nurse",
            password="pass12345",
            first_name="Jane",
            last_name="Doe",
            system_role="Nursing Officer",
        )
        cls.patient = Patient.objects.create(
            patient_id="PROC-PT-001",
            surname="Smith",
            first_name="John",
            gender="male",
            date_of_birth=date(1985, 3, 20),
        )

    def test_create_procedure_auto_id(self):
        proc = Procedure.objects.create(
            patient=self.patient,
            procedure_type="injection",
            description="IM Diclofenac 75mg",
            performed_by=self.nurse,
        )
        self.assertTrue(proc.procedure_id.startswith("PROC-"))
        self.assertEqual(proc.procedure_type, "injection")

    def test_create_procedure_with_explicit_id(self):
        proc = Procedure.objects.create(
            procedure_id="PROC-CUSTOM-0001",
            patient=self.patient,
            procedure_type="dressing",
            description="Wound dressing change",
            performed_by=self.nurse,
        )
        self.assertEqual(proc.procedure_id, "PROC-CUSTOM-0001")

    def test_procedure_str(self):
        proc = Procedure.objects.create(
            patient=self.patient,
            procedure_type="iv_insertion",
            description="IV line placement",
            performed_by=self.nurse,
        )
        self.assertIn("iv_insertion", str(proc))
        self.assertIn(self.patient.first_name, str(proc))

    def test_procedure_linked_to_nursing_order(self):
        order = NursingOrder.objects.create(
            patient=self.patient,
            order_type="Injection",
            description="Administer injection",
            ordered_by=self.nurse,
            created_by=self.nurse,
        )
        proc = Procedure.objects.create(
            patient=self.patient,
            nursing_order=order,
            procedure_type="injection",
            description="IM injection administered",
            performed_by=self.nurse,
        )
        self.assertEqual(proc.nursing_order, order)
        self.assertIn(proc, order.procedures.all())

    def test_update_procedure_description(self):
        proc = Procedure.objects.create(
            patient=self.patient,
            procedure_type="wound_care",
            description="Initial dressing",
            performed_by=self.nurse,
        )
        proc.description = "Re-dressing with antiseptic"
        proc.save()
        proc.refresh_from_db()
        self.assertEqual(proc.description, "Re-dressing with antiseptic")

    def test_procedure_type_choices(self):
        for ptype, _ in Procedure.PROCEDURE_TYPE_CHOICES:
            proc = Procedure.objects.create(
                patient=self.patient,
                procedure_type=ptype,
                description=f"Test {ptype}",
                performed_by=self.nurse,
            )
            self.assertEqual(proc.procedure_type, ptype)

    def test_procedure_unique_id_generation(self):
        p1 = Procedure.objects.create(
            patient=self.patient,
            procedure_type="injection",
            description="First",
            performed_by=self.nurse,
        )
        p2 = Procedure.objects.create(
            patient=self.patient,
            procedure_type="injection",
            description="Second",
            performed_by=self.nurse,
        )
        self.assertNotEqual(p1.procedure_id, p2.procedure_id)

    def test_procedure_medication_fields(self):
        proc = Procedure.objects.create(
            patient=self.patient,
            procedure_type="injection",
            description="Antibiotic",
            performed_by=self.nurse,
            medication_name="Ceftriaxone",
            dosage="1g",
            route="IV",
            site="Left arm",
        )
        self.assertEqual(proc.medication_name, "Ceftriaxone")
        self.assertEqual(proc.dosage, "1g")
        self.assertEqual(proc.route, "IV")
        self.assertEqual(proc.site, "Left arm")


class ProcedureAPITest(TestCase):
    """API tests for /api/v1/nursing/procedures/"""

    def setUp(self):
        self.nurse = User.objects.create_user(
            username="api_proc_nurse",
            password="pass12345",
            first_name="Nurse",
            last_name="API",
            system_role="Nursing Officer",
        )
        grant_pages(self.nurse, ["/nursing", "/nursing/procedures"])
        self.client = APIClient()
        self.client.force_authenticate(user=self.nurse)

        self.patient = Patient.objects.create(
            patient_id="PROC-PT-API",
            surname="Doe",
            first_name="Jane",
            gender="female",
            date_of_birth=date(1992, 7, 10),
        )
        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(9, 0),
            status="in_progress",
        )

    def test_create_procedure_via_api(self):
        resp = self.client.post("/api/v1/nursing/procedures/", {
            "patient": self.patient.id,
            "procedure_type": "injection",
            "description": "IM Artesunate 60mg",
            "visit": self.visit.id,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["procedure_id"].startswith("PROC-"))

    def test_list_procedures(self):
        Procedure.objects.create(
            patient=self.patient,
            procedure_type="dressing",
            description="Wound care",
            performed_by=self.nurse,
        )
        resp = self.client.get("/api/v1/nursing/procedures/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_retrieve_procedure(self):
        proc = Procedure.objects.create(
            patient=self.patient,
            procedure_type="catheterization",
            description="Urinary catheter",
            performed_by=self.nurse,
        )
        resp = self.client.get(f"/api/v1/nursing/procedures/{proc.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["procedure_type"], "catheterization")

    def test_update_procedure_notes(self):
        proc = Procedure.objects.create(
            patient=self.patient,
            procedure_type="wound_care",
            description="Debridement",
            performed_by=self.nurse,
        )
        resp = self.client.patch(
            f"/api/v1/nursing/procedures/{proc.id}/",
            {"notes": "Patient tolerated well"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        proc.refresh_from_db()
        self.assertEqual(proc.notes, "Patient tolerated well")

    def test_filter_by_procedure_type(self):
        Procedure.objects.create(
            patient=self.patient,
            procedure_type="injection",
            description="Inj A",
            performed_by=self.nurse,
        )
        Procedure.objects.create(
            patient=self.patient,
            procedure_type="dressing",
            description="Dress B",
            performed_by=self.nurse,
        )
        resp = self.client.get("/api/v1/nursing/procedures/?procedure_type=injection")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertTrue(all(r["procedure_type"] == "injection" for r in results))

    def test_resolve_procedure_for_order(self):
        order = NursingOrder.objects.create(
            patient=self.patient,
            order_type="Injection",
            description="Give injection",
            ordered_by=self.nurse,
            created_by=self.nurse,
        )
        proc = Procedure.objects.create(
            patient=self.patient,
            nursing_order=order,
            procedure_type="injection",
            description="Administered",
            performed_by=self.nurse,
        )
        resp = self.client.get(
            f"/api/v1/nursing/procedures/resolve/?nursing_order={order.id}"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], proc.id)

    def test_create_procedure_rejects_wrong_patient_for_order(self):
        other = Patient.objects.create(
            patient_id="PROC-PT-OTHER",
            surname="Other",
            first_name="Pat",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        order = NursingOrder.objects.create(
            patient=self.patient,
            order_type="Injection",
            description="Give injection",
            ordered_by=self.nurse,
            created_by=self.nurse,
        )
        resp = self.client.post("/api/v1/nursing/procedures/", {
            "patient": other.id,
            "nursing_order": order.id,
            "procedure_type": "injection",
            "description": "IM Artesunate 60mg",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_search_by_medication_name(self):
        Procedure.objects.create(
            patient=self.patient,
            procedure_type="injection",
            description="legacy",
            medication_name="Artesunate",
            performed_by=self.nurse,
        )
        resp = self.client.get("/api/v1/nursing/procedures/?search=Artesunate")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertTrue(any(r.get("medication_name") == "Artesunate" for r in results))

    def test_nursing_order_completed_sets_completed_at(self):
        order = NursingOrder.objects.create(
            patient=self.patient,
            order_type="Injection",
            description="Give injection",
            ordered_by=self.nurse,
            created_by=self.nurse,
        )
        resp = self.client.patch(
            f"/api/v1/nursing/orders/{order.id}/",
            {"status": "completed"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertIsNotNone(order.completed_at)

    def test_resolve_missing_order_param(self):
        resp = self.client.get("/api/v1/nursing/procedures/resolve/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_history_stats_action(self):
        Procedure.objects.create(
            patient=self.patient,
            procedure_type="injection",
            description="Inj",
            performed_by=self.nurse,
        )
        resp = self.client.get("/api/v1/nursing/procedures/history-stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("total", resp.data)
        self.assertIn("injections", resp.data)
