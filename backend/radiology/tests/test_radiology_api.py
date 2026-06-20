"""Comprehensive Radiology API tests covering the full order lifecycle.

Covers: create, list, filter, retrieve, schedule, acquire, report,
verify/reject reports, templates CRUD, stats, and auth checks.
"""
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_user, create_test_patient_visit
from radiology.models import (
    RadiologyOrder,
    RadiologyStudy,
    RadiologyReport,
    RadiologyTemplate,
)


BASE = "/api/v1/radiology"


class RadiologyOrderCreateTests(APITestCase):
    """POST /api/v1/radiology/orders/"""

    @classmethod
    def setUpTestData(cls):
        cls.doctor = create_test_user(
            "rad_api_dr",
            pages=["/consultation", "/radiology"],
            system_role="Medical Doctor",
        )
        cls.patient, cls.visit = create_test_patient_visit(patient_id="RADAPI-01")

    def setUp(self):
        self.client.force_authenticate(user=self.doctor)

    def test_create_order_with_studies(self):
        resp = self.client.post(f"{BASE}/orders/", {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "priority": "routine",
            "clinical_notes": "Persistent cough",
            "studies_data": [{
                "procedure": "Chest X-Ray",
                "body_part": "Chest",
                "modality": "X-Ray",
                "status": "pending",
            }],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("order_id", resp.data)
        self.assertEqual(len(resp.data["studies"]), 1)
        self.assertEqual(resp.data["studies"][0]["procedure"], "Chest X-Ray")

    def test_create_order_stat_priority(self):
        resp = self.client.post(f"{BASE}/orders/", {
            "patient": self.patient.pk,
            "priority": "stat",
            "clinical_notes": "Acute abdomen",
            "studies_data": [{
                "procedure": "Abdominal X-Ray",
                "body_part": "Abdomen",
                "modality": "X-Ray",
                "status": "pending",
            }],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        order = RadiologyOrder.objects.get(pk=resp.data["id"])
        self.assertEqual(order.priority, "stat")

    def test_create_order_requires_patient(self):
        resp = self.client.post(f"{BASE}/orders/", {
            "priority": "routine",
            "studies_data": [{
                "procedure": "Chest X-Ray",
                "body_part": "Chest",
                "modality": "X-Ray",
                "status": "pending",
            }],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_order_multiple_studies(self):
        resp = self.client.post(f"{BASE}/orders/", {
            "patient": self.patient.pk,
            "priority": "urgent",
            "clinical_notes": "Polytrauma",
            "studies_data": [
                {"procedure": "Chest X-Ray", "body_part": "Chest", "modality": "X-Ray", "status": "pending"},
                {"procedure": "Pelvis AP", "body_part": "Pelvis", "modality": "X-Ray", "status": "pending"},
                {"procedure": "CT Head", "body_part": "Head", "modality": "CT", "status": "pending"},
            ],
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(resp.data["studies"]), 3)


class RadiologyOrderListFilterTests(APITestCase):
    """GET /api/v1/radiology/orders/ — list, filter, retrieve, stats."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "rad_api_list",
            pages=["/radiology"],
            system_role="Radiologist",
        )
        cls.patient, _ = create_test_patient_visit(patient_id="RADAPI-LF-01")
        cls.other_patient, _ = create_test_patient_visit(patient_id="RADAPI-LF-02")

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order_routine = RadiologyOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
            clinical_notes="Routine imaging",
        )
        self.order_stat = RadiologyOrder.objects.create(
            patient=self.other_patient,
            doctor=self.user,
            created_by=self.user,
            priority="stat",
            clinical_notes="Emergency imaging",
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
        for key in ("total", "pending", "processing", "results_ready", "rejected", "stat"):
            self.assertIn(key, resp.data)

    def test_filter_by_study_status_pending_includes_scheduled_and_acquired(self):
        """study_status=pending should match pending, scheduled, and acquired studies."""
        order_pending = RadiologyOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        RadiologyStudy.objects.create(
            order=order_pending,
            procedure="Chest X-Ray",
            body_part="Chest",
            modality="X-Ray",
            status="pending",
        )

        order_scheduled = RadiologyOrder.objects.create(
            patient=self.other_patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        RadiologyStudy.objects.create(
            order=order_scheduled,
            procedure="Abdominal Ultrasound",
            body_part="Abdomen",
            modality="Ultrasound",
            status="scheduled",
        )

        order_acquired = RadiologyOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        RadiologyStudy.objects.create(
            order=order_acquired,
            procedure="CT Head",
            body_part="Head",
            modality="CT",
            status="acquired",
        )

        order_processing = RadiologyOrder.objects.create(
            patient=self.other_patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        RadiologyStudy.objects.create(
            order=order_processing,
            procedure="MRI Spine",
            body_part="Spine",
            modality="MRI",
            status="processing",
        )

        resp = self.client.get(f"{BASE}/orders/", {"study_status": "pending"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(
            ids,
            {order_pending.pk, order_scheduled.pk, order_acquired.pk},
        )


class RadiologyScheduleTests(APITestCase):
    """POST /api/v1/radiology/orders/{id}/schedule/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "rad_api_sched",
            pages=["/radiology"],
            system_role="Radiologist",
        )
        cls.patient, _ = create_test_patient_visit(patient_id="RADAPI-SC-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order = RadiologyOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        self.study = RadiologyStudy.objects.create(
            order=self.order,
            procedure="Chest X-Ray",
            body_part="Chest",
            modality="X-Ray",
            status="pending",
        )

    def test_schedule_study(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/schedule/",
            {
                "study_id": self.study.pk,
                "scheduled_date": "2026-07-01",
                "scheduled_time": "10:00:00",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.study.refresh_from_db()
        self.assertEqual(self.study.status, "scheduled")
        self.assertEqual(str(self.study.scheduled_date), "2026-07-01")

    def test_schedule_nonexistent_study_returns_404(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/schedule/",
            {"study_id": 99999, "scheduled_date": "2026-07-01"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class RadiologyAcquireTests(APITestCase):
    """POST /api/v1/radiology/orders/{id}/acquire/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "rad_api_acq",
            pages=["/radiology"],
            system_role="Radiologist",
        )
        cls.patient, _ = create_test_patient_visit(patient_id="RADAPI-AQ-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order = RadiologyOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        self.study = RadiologyStudy.objects.create(
            order=self.order,
            procedure="Chest X-Ray",
            body_part="Chest",
            modality="X-Ray",
            status="scheduled",
        )

    def test_acquire_study_in_house(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/acquire/",
            {
                "study_id": self.study.pk,
                "processing_method": "in_house",
                "images_count": 2,
                "technical_notes": "Good quality images",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.study.refresh_from_db()
        self.assertEqual(self.study.status, "acquired")
        self.assertEqual(self.study.images_count, 2)
        self.assertEqual(self.study.processing_method, "in_house")

    def test_acquire_nonexistent_study_returns_404(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/acquire/",
            {"study_id": 99999, "processing_method": "in_house"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class RadiologyReportTests(APITestCase):
    """POST /api/v1/radiology/orders/{id}/report/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "rad_api_rpt",
            pages=["/radiology"],
            system_role="Radiologist",
        )
        cls.patient, _ = create_test_patient_visit(patient_id="RADAPI-RP-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order = RadiologyOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        self.study = RadiologyStudy.objects.create(
            order=self.order,
            procedure="Chest X-Ray",
            body_part="Chest",
            modality="X-Ray",
            status="acquired",
        )

    def test_create_report(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/report/",
            {
                "study_id": self.study.pk,
                "report": "Normal chest radiograph. No acute findings.",
                "recommendations": "No follow-up needed",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.study.refresh_from_db()
        self.assertEqual(self.study.status, "reported")
        self.assertTrue(RadiologyReport.objects.filter(study=self.study).exists())

    def test_create_critical_report(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/report/",
            {
                "study_id": self.study.pk,
                "report": "Large pleural effusion identified.",
                "critical": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.study.refresh_from_db()
        self.assertIn("[CRITICAL FINDING]", self.study.report)
        report_record = RadiologyReport.objects.get(study=self.study)
        self.assertEqual(report_record.overall_status, "critical")

    def test_report_nonexistent_study_returns_404(self):
        resp = self.client.post(
            f"{BASE}/orders/{self.order.pk}/report/",
            {"study_id": 99999, "report": "Should fail"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class RadiologyVerificationTests(APITestCase):
    """POST /api/v1/radiology/verification/{id}/verify/ and reject/."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "rad_api_ver",
            pages=["/radiology"],
            system_role="Radiologist",
        )
        cls.patient, _ = create_test_patient_visit(patient_id="RADAPI-VR-01")

    def _create_reported_study(self):
        order = RadiologyOrder.objects.create(
            patient=self.patient,
            doctor=self.user,
            created_by=self.user,
            priority="routine",
        )
        study = RadiologyStudy.objects.create(
            order=order,
            procedure="Chest X-Ray",
            body_part="Chest",
            modality="X-Ray",
            status="reported",
            report="Normal findings",
            reported_by=self.user,
            reported_at=timezone.now(),
        )
        report = RadiologyReport.objects.create(
            study=study,
            order=order,
            patient=self.patient,
            overall_status="normal",
            priority="medium",
        )
        return order, study, report

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_verify_report(self):
        _, study, report = self._create_reported_study()
        resp = self.client.post(
            f"{BASE}/verification/{report.pk}/verify/",
            {"overall_status": "normal", "notes": "Verified and concur"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        study.refresh_from_db()
        self.assertEqual(study.status, "verified")
        self.assertEqual(study.verified_by, self.user)

    def test_reject_report(self):
        _, study, report = self._create_reported_study()
        report_pk = report.pk
        resp = self.client.post(
            f"{BASE}/verification/{report_pk}/reject/",
            {"reason": "Poor quality images, need repeat"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        study.refresh_from_db()
        self.assertEqual(study.status, "rejected")
        self.assertFalse(
            RadiologyReport.objects.filter(pk=report_pk).exists(),
            "Rejected report record should be deleted",
        )

    def test_verification_stats_endpoint(self):
        self._create_reported_study()
        resp = self.client.get(f"{BASE}/verification/stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for key in ("total", "normal", "abnormal", "critical"):
            self.assertIn(key, resp.data)


class RadiologyTemplateTests(APITestCase):
    """CRUD for /api/v1/radiology/templates/"""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "rad_api_tpl",
            pages=["/radiology"],
            system_role="Radiologist",
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_create_template(self):
        resp = self.client.post(f"{BASE}/templates/", {
            "name": "Chest PA",
            "code": "XR-CPA-API",
            "category": "xray",
            "body_part": "Chest",
            "modality": "X-Ray",
            "radiation_exposure": "low",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["code"], "XR-CPA-API")

    def test_list_templates(self):
        RadiologyTemplate.objects.create(
            name="Test Template",
            code="TT-RAD-API",
            category="xray",
        )
        resp = self.client.get(f"{BASE}/templates/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_update_template(self):
        tpl = RadiologyTemplate.objects.create(
            name="Old Name",
            code="OLD-RAD-API",
            category="xray",
        )
        resp = self.client.patch(
            f"{BASE}/templates/{tpl.pk}/",
            {"name": "New Name"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        tpl.refresh_from_db()
        self.assertEqual(tpl.name, "New Name")

    def test_delete_template(self):
        tpl = RadiologyTemplate.objects.create(
            name="To Delete",
            code="DEL-RAD-API",
            category="ct",
        )
        resp = self.client.delete(f"{BASE}/templates/{tpl.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(RadiologyTemplate.objects.filter(pk=tpl.pk).exists())


class RadiologyAuthTests(APITestCase):
    """Auth: unauthenticated → 401, wrong page → 403."""

    def test_unauthenticated_list_returns_401(self):
        resp = self.client.get(f"{BASE}/orders/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_create_returns_401(self):
        resp = self.client.post(f"{BASE}/orders/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_no_radiology_page_returns_403(self):
        user = create_test_user("rad_api_noaccess", pages=["/pharmacy"])
        self.client.force_authenticate(user=user)
        resp = self.client.get(f"{BASE}/orders/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class RadiologyOrderFullLifecycleTest(APITestCase):
    """End-to-end: create → schedule → acquire → report → verify."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user(
            "rad_api_lifecycle",
            pages=["/consultation", "/radiology"],
            system_role="Medical Doctor",
        )
        cls.patient, cls.visit = create_test_patient_visit(patient_id="RADAPI-LC-01")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_full_lifecycle_pending_to_verified(self):
        # 1. Create order with a study
        create_resp = self.client.post(f"{BASE}/orders/", {
            "patient": self.patient.pk,
            "priority": "routine",
            "clinical_notes": "Cough for 2 weeks",
            "studies_data": [{
                "procedure": "Chest X-Ray",
                "body_part": "Chest",
                "modality": "X-Ray",
                "status": "pending",
            }],
        }, format="json")
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        order_pk = create_resp.data["id"]
        study_pk = create_resp.data["studies"][0]["id"]

        # 2. Schedule the study
        sched_resp = self.client.post(
            f"{BASE}/orders/{order_pk}/schedule/",
            {
                "study_id": study_pk,
                "scheduled_date": "2026-07-15",
                "scheduled_time": "09:00:00",
            },
            format="json",
        )
        self.assertEqual(sched_resp.status_code, status.HTTP_200_OK)
        study = RadiologyStudy.objects.get(pk=study_pk)
        self.assertEqual(study.status, "scheduled")

        # 3. Acquire the study
        acq_resp = self.client.post(
            f"{BASE}/orders/{order_pk}/acquire/",
            {
                "study_id": study_pk,
                "processing_method": "in_house",
                "images_count": 2,
            },
            format="json",
        )
        self.assertEqual(acq_resp.status_code, status.HTTP_200_OK)
        study.refresh_from_db()
        self.assertEqual(study.status, "acquired")

        # 4. Create report
        rpt_resp = self.client.post(
            f"{BASE}/orders/{order_pk}/report/",
            {
                "study_id": study_pk,
                "report": "Normal chest. No abnormalities detected.",
            },
            format="json",
        )
        self.assertEqual(rpt_resp.status_code, status.HTTP_200_OK)
        study.refresh_from_db()
        self.assertEqual(study.status, "reported")

        # 5. Verify the report
        rad_report = RadiologyReport.objects.get(study_id=study_pk)
        ver_resp = self.client.post(
            f"{BASE}/verification/{rad_report.pk}/verify/",
            {"overall_status": "normal"},
            format="json",
        )
        self.assertEqual(ver_resp.status_code, status.HTTP_200_OK)
        study.refresh_from_db()
        self.assertEqual(study.status, "verified")
        self.assertIsNotNone(study.verified_at)
