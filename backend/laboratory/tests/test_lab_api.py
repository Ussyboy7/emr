"""Comprehensive Lab API tests covering the full order lifecycle.

Covers: create, list, filter, retrieve, collect samples, submit results,
verify results, templates CRUD, stats, and auth checks.
"""
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_user, create_test_patient_visit
from laboratory.models import LabOrder, LabTemplate, LabTest, LabResult


BASE = "/api/v1/laboratory"


class LabOrderCreateTests(APITestCase):
    """POST /api/v1/laboratory/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.doctor = create_test_user(
            "lab_api_dr",
            pages=["/consultation", "/laboratory"],
            system_role="Medical Doctor",
        )
        cls.patient, cls.visit = create_test_patient_visit(patient_id="LABAPI-01")
        cls.template = LabTemplate.objects.create(
            name="Full Blood Count",
            code="FBC-API",
            category="hematology",
            sample_type="Blood",
            normal_range={"WBC": {"min": 4, "max": 11, "unit": "x10^9/L"}},
        )

    def setUp(self):
        self.client.force_authenticate(user=self.doctor)

    def test_create_order_with_tests(self):
        resp = self.client.post(f"{BASE}/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "priority": "routine",
            "clinical_notes": "Routine check",
            "tests_data": [
                {
                    "name": "Full Blood Count",
                    "code": "FBC",
                    "sample_type": "Blood",
                    "status": "pending",
                    "template": self.template.pk,
                },
            ],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("order_id", resp.data)
        self.assertEqual(len(resp.data["tests"]), 1)
        self.assertEqual(resp.data["tests"][0]["status"], "pending")

    def test_create_order_stat_priority(self):
        resp = self.client.post(f"{BASE}/orders/", {
            "patient": self.patient.pk,
            "priority": "stat",
            "clinical_notes": "Emergency",
            "tests_data": [
                {"name": "RBS", "code": "RBS", "sample_type": "Blood", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        order = LabOrder.objects.get(pk=resp.data["id"])
        self.assertEqual(order.priority, "stat")

    def test_create_order_requires_patient(self):
        resp = self.client.post(f"{BASE}/orders/", {
            "priority": "routine",
            "tests_data": [
                {"name": "X", "code": "X", "sample_type": "Blood", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_order_multiple_tests(self):
        resp = self.client.post(f"{BASE}/orders/", {
            "patient": self.patient.pk,
            "priority": "urgent",
            "clinical_notes": "Multi-test",
            "tests_data": [
                {"name": "FBC", "code": "FBC", "sample_type": "Blood", "status": "pending"},
                {"name": "UA", "code": "UA", "sample_type": "Urine", "status": "pending"},
                {"name": "LFT", "code": "LFT", "sample_type": "Blood", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(resp.data["tests"]), 3)


class LabOrderListFilterTests(APITestCase):
    """GET /api/v1/laboratory/orders/ — list, filter, retrieve, stats."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "lab_api_list",
            pages=["/laboratory"],
            system_role="Laboratory Scientist",
        )
        cls.patient, cls.visit = create_test_patient_visit(patient_id="LABAPI-LF-01")
        cls.other_patient, _ = create_test_patient_visit(patient_id="LABAPI-LF-02")

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order_routine = LabOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
            clinical_notes="Routine",
        )
        self.order_stat = LabOrder.objects.create(
            patient=self.other_patient,
            doctor=self.user,
            created_by=self.user,
            priority="stat",
            clinical_notes="STAT",
        )

    def test_list_returns_paginated(self):
        resp = self.client.get(f"{BASE}/orders/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("count", resp.data)
        self.assertIn("results", resp.data)
        self.assertGreaterEqual(resp.data["count"], 2)

    def test_filter_by_patient(self):
        resp = self.client.get(f"{BASE}/orders/", {"patient": self.patient.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)

    def test_filter_by_priority(self):
        resp = self.client.get(f"{BASE}/orders/", {"priority": "stat"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)

    def test_retrieve_single_order(self):
        resp = self.client.get(f"{BASE}/orders/{self.order_routine.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], self.order_routine.pk)
        self.assertIn("order_id", resp.data)

    def test_stats_endpoint(self):
        resp = self.client.get(f"{BASE}/orders/stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for key in ("total", "pending", "processing", "results_ready", "rework_required", "stat"):
            self.assertIn(key, resp.data)


class LabOrderWorkflowTabFilterTests(APITestCase):
    """GET /api/v1/laboratory/orders/?workflow_tab=… — tab-scoped list."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "lab_api_wf_tab",
            pages=["/laboratory"],
            system_role="Laboratory Scientist",
        )
        cls.patient, _ = create_test_patient_visit(patient_id="LABAPI-WF-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order_pending = LabOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        LabTest.objects.create(
            order=self.order_pending,
            name="FBC",
            code="FBC",
            sample_type="Blood",
            status="pending",
        )
        self.order_processing = LabOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        LabTest.objects.create(
            order=self.order_processing,
            name="Glucose",
            code="GLU",
            sample_type="Blood",
            status="processing",
        )
        self.order_results = LabOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        LabTest.objects.create(
            order=self.order_results,
            name="LFT",
            code="LFT",
            sample_type="Blood",
            status="results_ready",
        )
        self.order_rejected = LabOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        LabTest.objects.create(
            order=self.order_rejected,
            name="ESR",
            code="ESR",
            sample_type="Blood",
            status="rejected",
        )

    def test_workflow_tab_pending(self):
        resp = self.client.get(f"{BASE}/orders/", {"workflow_tab": "pending"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.order_pending.pk})

    def test_workflow_tab_processing(self):
        resp = self.client.get(f"{BASE}/orders/", {"workflow_tab": "processing"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.order_processing.pk})

    def test_workflow_tab_results_ready_alias(self):
        for tab in ("results", "results_ready"):
            resp = self.client.get(f"{BASE}/orders/", {"workflow_tab": tab})
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            ids = {row["id"] for row in resp.data["results"]}
            self.assertEqual(ids, {self.order_results.pk})

    def test_workflow_tab_rejected(self):
        resp = self.client.get(f"{BASE}/orders/", {"workflow_tab": "rejected"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {self.order_rejected.pk})


class LabSampleCollectionTests(APITestCase):
    """POST /api/v1/laboratory/orders/{id}/collect_samples/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "lab_api_coll",
            pages=["/laboratory"],
            system_role="Laboratory Scientist",
        )
        cls.patient, _ = create_test_patient_visit(patient_id="LABAPI-CO-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order = LabOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        self.test1 = LabTest.objects.create(
            order=self.order,
            name="FBC", code="FBC", sample_type="Blood", status="pending",
        )
        self.test2 = LabTest.objects.create(
            order=self.order,
            name="ESR", code="ESR", sample_type="Blood", status="pending",
        )

    def test_collect_samples_updates_status_and_lab_number(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/collect_samples/",
            {"test_ids": [self.test1.pk, self.test2.pk]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.test1.refresh_from_db()
        self.test2.refresh_from_db()
        self.assertEqual(self.test1.status, "sample_collected")
        self.assertEqual(self.test2.status, "sample_collected")
        self.assertIsNotNone(self.test1.lab_number)
        self.assertEqual(self.test1.lab_number, self.test2.lab_number,
                         "All tests in one order share a single lab number")
        self.assertIsInstance(resp.data, list)
        self.assertEqual({test["id"] for test in resp.data}, {self.test1.pk, self.test2.pk})

    def test_hyphenated_collect_samples_returns_batch_and_tests(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.test1.pk, self.test2.pk]},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("sample_batch", resp.data)
        self.assertIn("tests", resp.data)
        self.assertEqual({test["id"] for test in resp.data["tests"]}, {self.test1.pk, self.test2.pk})

    def test_collect_samples_empty_ids_returns_400(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/collect_samples/",
            {"test_ids": []},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class LabSubmitResultsTests(APITestCase):
    """POST /api/v1/laboratory/orders/{id}/submit_results/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "lab_api_res",
            pages=["/laboratory"],
            system_role="Laboratory Scientist",
        )
        cls.patient, _ = create_test_patient_visit(patient_id="LABAPI-SR-01")
        cls.template = LabTemplate.objects.create(
            name="Glucose",
            code="GLU-API",
            category="chemistry",
            sample_type="Blood",
            normal_range={"Glucose": {"min": 70, "max": 140, "unit": "mg/dL"}},
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order = LabOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        self.test_obj = LabTest.objects.create(
            order=self.order,
            template=self.template,
            name="Glucose", code="GLU", sample_type="Blood",
            status="processing",
        )

    def test_submit_results_creates_lab_result(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/submit_results/",
            {"test_id": self.test_obj.pk, "results": {"Glucose": "110"}, "notes": "Normal"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.test_obj.refresh_from_db()
        self.assertEqual(self.test_obj.status, "results_ready")
        self.assertTrue(LabResult.objects.filter(test=self.test_obj).exists())

    def test_submit_empty_results_returns_400(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/submit_results/",
            {"test_id": self.test_obj.pk, "results": {}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_submit_results_nonexistent_test_returns_404(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/submit_results/",
            {"test_id": 99999, "results": {"Glucose": "110"}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class LabVerificationTests(APITestCase):
    """POST /api/v1/laboratory/verification/{id}/verify/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "lab_api_ver",
            pages=["/laboratory"],
            system_role="Laboratory Scientist",
        )
        cls.patient, _ = create_test_patient_visit(patient_id="LABAPI-VR-01")
        cls.template = LabTemplate.objects.create(
            name="RBS",
            code="RBS-API",
            category="chemistry",
            sample_type="Blood",
            normal_range={"RBS": {"min": 70, "max": 140, "unit": "mg/dL"}},
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order = LabOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        self.test_obj = LabTest.objects.create(
            order=self.order,
            template=self.template,
            name="RBS", code="RBS", sample_type="Blood",
            status="results_ready",
            results={"RBS": "100"},
            processed_by=self.user,
            processed_at=timezone.now(),
        )
        self.lab_result = LabResult.objects.create(
            test=self.test_obj,
            order=self.order,
            patient=self.patient,
            overall_status="normal",
            priority="medium",
        )

    def test_verify_sets_status_to_verified(self):
        resp = self.client.post(
            f"{BASE}/verification/{self.lab_result.pk}/verify/",
            {"overall_status": "normal", "notes": "Confirmed normal"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.test_obj.refresh_from_db()
        self.assertEqual(self.test_obj.status, "verified")
        self.assertEqual(self.test_obj.verified_by, self.user)

    def test_verification_stats_endpoint(self):
        resp = self.client.get(f"{BASE}/verification/stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for key in ("total", "normal", "abnormal", "critical"):
            self.assertIn(key, resp.data)


class LabTemplateTests(APITestCase):
    """CRUD for /api/v1/laboratory/templates/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "lab_api_tpl",
            pages=["/laboratory"],
            system_role="Laboratory Scientist",
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_create_template(self):
        resp = self.client.post(f"{BASE}/templates/", {
            "name": "Malaria Parasite",
            "code": "MP-API",
            "category": "parasitology",
            "sample_type": "Blood",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["code"], "MP-API")

    def test_list_templates(self):
        LabTemplate.objects.create(name="Test1", code="T1-API", sample_type="Blood")
        resp = self.client.get(f"{BASE}/templates/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_update_template(self):
        tpl = LabTemplate.objects.create(name="Old Name", code="OLD-API", sample_type="Blood")
        resp = self.client.patch(
            f"{BASE}/templates/{tpl.pk}/",
            {"name": "Updated Name"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        tpl.refresh_from_db()
        self.assertEqual(tpl.name, "Updated Name")

    def test_delete_template(self):
        tpl = LabTemplate.objects.create(name="Del", code="DEL-API", sample_type="Blood")
        resp = self.client.delete(f"{BASE}/templates/{tpl.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(LabTemplate.objects.filter(pk=tpl.pk).exists())


class LabAuthTests(APITestCase):
    """Auth: unauthenticated → 401, wrong page → 403."""

    def test_unauthenticated_list_returns_401(self):
        resp = self.client.get(f"{BASE}/orders/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_create_returns_401(self):
        resp = self.client.post(f"{BASE}/orders/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_no_lab_page_returns_403(self):
        user = create_test_user("lab_api_noaccess", pages=["/pharmacy"])
        self.client.force_authenticate(user=user)
        resp = self.client.get(f"{BASE}/orders/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class LabOrderFullLifecycleTest(APITestCase):
    """End-to-end: create → collect → submit results → verify."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "lab_api_lifecycle",
            pages=["/consultation", "/laboratory"],
            system_role="Medical Doctor",
        )
        cls.patient, cls.visit = create_test_patient_visit(patient_id="LABAPI-LC-01")
        cls.template = LabTemplate.objects.create(
            name="Glucose",
            code="GLU-LIFE",
            category="chemistry",
            sample_type="Blood",
            normal_range={"Glucose": {"min": 70, "max": 140, "unit": "mg/dL"}},
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_full_lifecycle_pending_to_verified(self):
        # 1. Create order with a test
        create_resp = self.client.post(f"{BASE}/orders/", {
            "patient": self.patient.pk,
            "priority": "routine",
            "tests_data": [{
                "name": "Glucose", "code": "GLU", "sample_type": "Blood",
                "status": "pending", "template": self.template.pk,
            }],
        }, format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        order_pk = create_resp.data["id"]
        test_pk = create_resp.data["tests"][0]["id"]

        # 2. Collect samples — status becomes sample_collected, lab number assigned
        collect_resp = self.client.post(
            f"{BASE}/orders/{order_pk}/collect_samples/",
            {"test_ids": [test_pk]},
            format="json",
        )
        self.assertEqual(collect_resp.status_code, status.HTTP_200_OK)
        test_obj = LabTest.objects.get(pk=test_pk)
        self.assertEqual(test_obj.status, "sample_collected")
        self.assertTrue(test_obj.lab_number)

        # 3. Submit results — status becomes results_ready, LabResult created
        submit_resp = self.client.post(
            f"{BASE}/orders/{order_pk}/submit_results/",
            {"test_id": test_pk, "results": {"Glucose": "100"}},
            format="json",
        )
        self.assertEqual(submit_resp.status_code, status.HTTP_200_OK)
        test_obj.refresh_from_db()
        self.assertEqual(test_obj.status, "results_ready")

        # 4. Verify — status becomes verified
        lab_result = LabResult.objects.get(test_id=test_pk)
        verify_resp = self.client.post(
            f"{BASE}/verification/{lab_result.pk}/verify/",
            {"overall_status": "normal", "notes": "All clear"},
            format="json",
        )
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)
        test_obj.refresh_from_db()
        self.assertEqual(test_obj.status, "verified")
        self.assertIsNotNone(test_obj.verified_at)
