from datetime import date
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db import transaction
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from laboratory.models import (
    LabOrder,
    LabReferralDispatch,
    LabSampleBatch,
    LabTest,
    LabTestRoutingEvent,
)
from organization.models import Clinic, SystemConfig
from patients.models import Patient
from common.tests.support import create_test_user
from laboratory.dispatch_pdfs import _dispatch_accession
from permissions.models import Role, UserRole

User = get_user_model()


class LabOrderRoutingModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.hq = Clinic.objects.create(name="Headquarters", code="HQ")
        cls.bode_thomas = Clinic.objects.create(name="Bode Thomas", code="BODE")
        cls.patient = Patient.objects.create(
            patient_id="ROUTING-LAB-01",
            surname="Routing",
            first_name="Lab",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        cls.order = LabOrder.objects.create(
            order_id="LAB-ROUTING-01",
            patient=cls.patient,
        )

    def test_lab_tests_in_one_sample_batch_share_accession_but_route_independently(self):
        batch = LabSampleBatch.objects.create(
            order=self.order,
            collection_clinic=self.hq,
            accession_number="HQ-26-0001",
        )
        test_a = LabTest.objects.create(
            order=self.order,
            name="Full Blood Count",
            code="FBC",
            sample_type="blood",
        )
        test_b = LabTest.objects.create(
            order=self.order,
            name="Urinalysis",
            code="UA",
            sample_type="urine",
        )

        test_a.sample_batch = batch
        test_b.sample_batch = batch
        test_a.processing_clinic = self.hq
        test_b.processing_clinic = self.bode_thomas
        test_a.save()
        test_b.save()
        test_a.refresh_from_db()
        test_b.refresh_from_db()

        self.assertEqual(test_a.sample_batch.accession_number, test_b.sample_batch.accession_number)
        self.assertNotEqual(test_a.processing_clinic_id, test_b.processing_clinic_id)

    def test_lab_test_rejects_sample_batch_from_another_order(self):
        other_order = LabOrder.objects.create(
            order_id="LAB-ROUTING-02",
            patient=self.patient,
        )
        batch = LabSampleBatch.objects.create(
            order=other_order,
            collection_clinic=self.hq,
            accession_number="HQ-26-0002",
        )
        test = LabTest.objects.create(
            order=self.order,
            name="Full Blood Count",
            code="FBC-2",
            sample_type="blood",
            sample_batch=batch,
        )

        with self.assertRaises(ValidationError):
            test.full_clean()

    def test_routing_event_constraints_allow_matching_destinations(self):
        test = LabTest.objects.create(
            order=self.order,
            name="Full Blood Count",
            code="FBC-3",
            sample_type="blood",
        )

        LabTestRoutingEvent.objects.create(
            test=test,
            destination_type="internal",
            to_clinic=self.hq,
        )
        LabTestRoutingEvent.objects.create(
            test=test,
            destination_type="external",
            external_destination="External Lab",
        )

    def test_routing_event_constraints_reject_missing_destinations(self):
        test = LabTest.objects.create(
            order=self.order,
            name="Full Blood Count",
            code="FBC-4",
            sample_type="blood",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                LabTestRoutingEvent.objects.create(test=test, destination_type="internal")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                LabTestRoutingEvent.objects.create(test=test, destination_type="external")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                LabTestRoutingEvent.objects.create(
                    test=test,
                    destination_type="internal",
                    to_clinic=self.hq,
                    external_destination="External Lab",
                )

    def test_existing_status_and_routing_status_remain_independent(self):
        test = LabTest.objects.create(
            order=self.order,
            name="Chemistry Panel",
            code="CHEM-1",
            sample_type="blood",
            status="processing",
            routing_status="sent_to_processing",
        )

        self.assertEqual(test.status, "processing")
        self.assertEqual(test.routing_status, "sent_to_processing")

    def test_lab_test_processing_clinic_name_falls_back_to_order_destination(self):
        order = LabOrder.objects.create(
            order_id="LAB-ROUTING-SERIALIZER-FALLBACK",
            patient=self.patient,
            processing_clinic=self.bode_thomas,
        )
        test = LabTest.objects.create(
            order=order,
            name="Full Blood Count",
            code="FBC-FALLBACK",
            sample_type="blood",
            processing_clinic=None,
        )

        from laboratory.serializers import LabTestSerializer

        self.assertEqual(
            LabTestSerializer(test).data["processing_clinic_name"],
            "Bode Thomas",
        )

    def test_dispatch_accession_uses_selected_tests_not_newest_order_batch(self):
        selected_batch = LabSampleBatch.objects.create(
            order=self.order,
            collection_clinic=self.hq,
            accession_number="HQ-26-0003",
        )
        unrelated_batch = LabSampleBatch.objects.create(
            order=self.order,
            collection_clinic=self.bode_thomas,
            accession_number="BODE-26-0004",
        )
        test = LabTest.objects.create(
            order=self.order,
            name="Full Blood Count",
            code="FBC-5",
            sample_type="blood",
            sample_batch=selected_batch,
        )
        dispatch = LabReferralDispatch.objects.create(
            dispatch_id="LBR-2026-000001",
            order=self.order,
            partner_name="Reference Lab",
        )
        dispatch.tests.set([test])

        self.assertEqual(_dispatch_accession(dispatch), "HQ-26-0003")

    def test_dispatch_accession_does_not_use_newer_batch_for_uncollected_selected_test(self):
        unrelated_batch = LabSampleBatch.objects.create(
            order=self.order,
            collection_clinic=self.bode_thomas,
            accession_number="BODE-26-0005",
        )
        selected_test = LabTest.objects.create(
            order=self.order,
            name="Uncollected Test",
            code="UNCOLLECTED-1",
            sample_type="blood",
        )
        dispatch = LabReferralDispatch.objects.create(
            dispatch_id="LBR-2026-000002",
            order=self.order,
            partner_name="Reference Lab",
        )
        dispatch.tests.set([selected_test])

        self.assertIsNone(selected_test.sample_batch_id)
        self.assertEqual(unrelated_batch.accession_number, "BODE-26-0005")
        self.assertEqual(_dispatch_accession(dispatch), "")


class LabOrderRoutingApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled",
            defaults={"value": "true"},
        )
        cls.hq = Clinic.objects.create(name="Lab API HQ", code="LAB-API-HQ")
        cls.bode = Clinic.objects.create(name="Lab API Bode", code="LAB-API-BODE")
        cls.hq.default_processing_clinic = cls.bode
        cls.hq.save(update_fields=["default_processing_clinic"])
        cls.tin_can = Clinic.objects.create(name="Tin Can", code="TIN CAN")
        cls.other = Clinic.objects.create(name="Lab API Other", code="LAB-API-OTHER")
        cls.patient = Patient.objects.create(
            patient_id="LAB-API-PT",
            surname="API",
            first_name="Lab",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        cls.user = create_test_user("lab-routing-api", pages=["/laboratory"], system_role="Laboratory Scientist")
        cls.user.location_clinic = cls.hq
        cls.user.active_clinic = cls.hq
        cls.user.save()
        cls.user.location_clinics.add(cls.hq, cls.bode, cls.tin_can)
        cls.lab_role = Role.objects.create(
            name="Lab routing role",
            type="clinical",
            permissions={"pages": ["/laboratory"]},
            is_active=True,
        )
        UserRole.objects.create(user=cls.user, role=cls.lab_role)

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order = LabOrder.objects.create(
            order_id=f"LAB-API-{LabOrder.objects.count() + 1}",
            patient=self.patient,
            location_clinic=self.hq,
            processing_clinic=self.hq,
        )
        self.first = LabTest.objects.create(
            order=self.order, name="Full Blood Count", code="LAB-FBC", sample_type="blood"
        )
        self.second = LabTest.objects.create(
            order=self.order, name="Urinalysis", code="LAB-UA", sample_type="urine"
        )

    def _route(self, payload):
        return self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/route-tests/",
            payload,
            format="json",
        )

    def test_route_local_updates_only_selected_lines_and_creates_events(self):
        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
            "reason": "Bode processing capacity",
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual(self.first.processing_clinic_id, self.bode.pk)
        self.assertEqual(self.first.routing_status, "sent_to_processing")
        self.assertEqual(self.second.routing_status, "pending_triage")
        self.assertEqual(LabTestRoutingEvent.objects.filter(test=self.first).count(), 1)
        self.assertEqual(len(response.data["lines"]), 1)
        self.assertEqual(len(response.data["routing_events"]), 1)

    def test_processing_clinic_filters_list_and_stats_without_changing_origin_filter(self):
        self.order.processing_clinic = self.bode
        self.order.save(update_fields=["processing_clinic"])
        other_order = LabOrder.objects.create(
            order_id="LAB-API-PROCESSING-FILTER",
            patient=self.patient,
            location_clinic=self.tin_can,
            processing_clinic=self.bode,
        )
        LabTest.objects.create(order=other_order, name="Other test", code="LAB-OTHER", sample_type="blood")

        response = self.client.get(
            "/api/v1/laboratory/orders/",
            {"processing_clinic": self.bode.pk, "location_clinic": self.hq.pk},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data["results"]], [self.order.pk])

        stats = self.client.get(
            "/api/v1/laboratory/orders/stats/",
            {"processing_clinic": self.bode.pk, "location_clinic": self.hq.pk},
        )
        self.assertEqual(stats.status_code, status.HTTP_200_OK)
        self.assertEqual(stats.data["total"], 1)

    def test_line_processing_clinic_is_included_in_order_list_scope(self):
        other_order = LabOrder.objects.create(
            order_id="LAB-API-LINE-SCOPE",
            patient=self.patient,
            location_clinic=self.other,
            processing_clinic=self.other,
        )
        LabTest.objects.create(
            order=other_order,
            name="Line-routed test",
            code="LAB-LINE-SCOPE",
            sample_type="blood",
            processing_clinic=self.bode,
        )

        response = self.client.get(
            "/api/v1/laboratory/orders/",
            {"processing_clinic": self.bode.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(other_order.pk, [row["id"] for row in response.data["results"]])
        stats = self.client.get(
            "/api/v1/laboratory/orders/stats/", {"processing_clinic": self.bode.pk}
        )
        self.assertEqual(stats.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(stats.data["total"], 1)

    def test_explicit_unassigned_clinic_scope_is_rejected(self):
        unauthorized = create_test_user(
            "lab-routing-explicit-scope", pages=["/laboratory"], system_role="Laboratory Scientist"
        )
        unauthorized.location_clinic = self.other
        unauthorized.active_clinic = self.other
        unauthorized.save()
        unauthorized.location_clinics.add(self.other)
        self.client.force_authenticate(user=unauthorized)

        response = self.client.get(
            "/api/v1/laboratory/orders/", {"clinic_id": self.hq.pk}
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_generic_lab_test_patch_cannot_change_routing_fields(self):
        response = self.client.patch(
            f"/api/v1/laboratory/tests/{self.first.pk}/",
            {"processing_clinic": self.bode.pk, "routing_status": "sent_to_processing"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.first.refresh_from_db()
        self.assertIsNone(self.first.processing_clinic_id)
        self.assertEqual(self.first.routing_status, "pending_triage")

    def test_collect_rejects_test_already_assigned_to_another_sample_batch(self):
        first_batch = LabSampleBatch.objects.create(
            order=self.order,
            collection_clinic=self.hq,
            accession_number="LAB-API-EXISTING-1",
        )
        second_batch = LabSampleBatch.objects.create(
            order=self.order,
            collection_clinic=self.hq,
            accession_number="LAB-API-EXISTING-2",
        )
        self.first.sample_batch = first_batch
        self.first.save(update_fields=["sample_batch"])

        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.first.pk], "collection_clinic": self.hq.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.first.refresh_from_db()
        self.assertEqual(self.first.sample_batch_id, first_batch.pk)
        self.assertNotEqual(self.first.sample_batch_id, second_batch.pk)

    def test_external_route_requires_nonblank_reason(self):
        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "external",
            "external_destination": "Reference Lab",
            "reason": "  ",
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_route_requires_lab_capability(self):
        for user_role in UserRole.objects.filter(user=self.user).select_related("role"):
            user_role.role.permissions = {"pages": [], "capabilities": []}
            user_role.role.save(update_fields=["permissions"])
        self.user._cached_capabilities = None
        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_collect_requires_lab_collect_capability(self):
        for user_role in UserRole.objects.filter(user=self.user).select_related("role"):
            user_role.role.permissions = {"pages": [], "capabilities": []}
            user_role.role.save(update_fields=["permissions"])
        self.user._cached_capabilities = None
        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect_samples/",
            {"test_ids": [self.first.pk], "collection_clinic": self.hq.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_route_external_requires_destination_and_dispatches_exact_lines(self):
        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "external",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "external",
            "external_destination": "Reference Lab",
            "reason": "Reference lab required",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        self.assertEqual(self.first.status, "processing")
        self.assertEqual(response.data["dispatch"]["tests"][0]["id"], self.first.pk)
        self.assertEqual(response.data["dispatch"]["tests"][0]["code"], "LAB-FBC")

    def test_route_rejects_empty_selection_and_unassigned_destination(self):
        response = self._route({"test_ids": [], "destination_type": "internal", "processing_clinic": self.hq.pk})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.other.pk,
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_internal_route_requires_processing_clinic(self):
        response = self._route({"test_ids": [self.first.pk], "destination_type": "internal"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_collect_samples_returns_accession_and_selected_tests(self):
        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.first.pk], "collection_clinic": self.hq.pk, "collection_method": "venipuncture"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["sample_batch"]["accession_number"])
        self.assertEqual(response.data["tests"][0]["id"], self.first.pk)

    def test_hq_origin_order_collected_at_tin_can_uses_tin_can_accession(self):
        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.first.pk], "collection_clinic": self.tin_can.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertRegex(
            response.data["sample_batch"]["accession_number"],
            r"^TIN-CAN-\d{2}-\d{4}$",
        )
        self.assertEqual(
            LabSampleBatch.objects.get(tests=self.first).collection_clinic_id,
            self.tin_can.pk,
        )

    def test_legacy_generate_lab_number_uses_active_clinic_and_returns_lab_test_shape(self):
        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/generate_lab_number/",
            {"test_id": self.first.pk, "collection_clinic": self.tin_can.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["id"], self.first.pk)
        self.assertRegex(response.data["accession_number"], r"^TIN-CAN-\d{2}-\d{4}$")
        self.assertEqual(
            LabSampleBatch.objects.get(tests=self.first).collection_clinic_id,
            self.tin_can.pk,
        )

    def test_legacy_generate_lab_number_is_idempotent_for_collected_test(self):
        first_response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/generate_lab_number/",
            {"test_id": self.first.pk, "collection_clinic": self.tin_can.pk},
            format="json",
        )
        second_response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/generate_lab_number/",
            {"test_id": self.first.pk, "collection_clinic": self.tin_can.pk},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK, first_response.data)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK, second_response.data)
        self.assertEqual(
            second_response.data["accession_number"],
            first_response.data["accession_number"],
        )
        self.assertEqual(
            LabSampleBatch.objects.filter(order=self.order).count(),
            1,
        )

    def test_legacy_endpoints_share_omitted_collection_clinic_fallback_and_idempotency(self):
        collector_clinic = self.bode
        self.user.active_clinic = collector_clinic
        self.user.is_management = True
        self.user.save(update_fields=["active_clinic", "is_management"])
        self.order.location_clinic = self.hq
        self.order.processing_clinic = self.hq
        self.order.save(update_fields=["location_clinic", "processing_clinic"])

        collect_response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect_samples/?clinic_id=all",
            {"test_ids": [self.first.pk]},
            format="json",
        )
        self.assertEqual(collect_response.status_code, status.HTTP_200_OK, collect_response.data)

        generate_order = LabOrder.objects.create(
            order_id=f"LAB-API-GENERATE-{LabOrder.objects.count() + 1}",
            patient=self.patient,
            location_clinic=self.hq,
            processing_clinic=self.hq,
        )
        generate_test = LabTest.objects.create(
            order=generate_order,
            name="Chemistry Panel",
            code="LAB-CHEM",
            sample_type="blood",
        )
        generate_payload = {"test_id": generate_test.pk}
        first_generate_response = self.client.post(
            f"/api/v1/laboratory/orders/{generate_order.pk}/generate_lab_number/?clinic_id=all",
            generate_payload,
            format="json",
        )
        second_generate_response = self.client.post(
            f"/api/v1/laboratory/orders/{generate_order.pk}/generate_lab_number/?clinic_id=all",
            generate_payload,
            format="json",
        )

        self.assertEqual(first_generate_response.status_code, status.HTTP_200_OK, first_generate_response.data)
        self.assertEqual(second_generate_response.status_code, status.HTTP_200_OK, second_generate_response.data)
        collect_batch = LabSampleBatch.objects.get(tests=self.first)
        generate_batch = LabSampleBatch.objects.get(tests=generate_test)
        self.assertEqual(collect_batch.collection_clinic_id, collector_clinic.pk)
        self.assertEqual(generate_batch.collection_clinic_id, collector_clinic.pk)
        self.assertRegex(collect_batch.accession_number, r"^LAB-API-BODE-\d{2}-\d{4}$")
        self.assertRegex(generate_batch.accession_number, r"^LAB-API-BODE-\d{2}-\d{4}$")
        self.assertEqual(
            second_generate_response.data["accession_number"],
            first_generate_response.data["accession_number"],
        )
        self.assertEqual(LabSampleBatch.objects.filter(order=generate_order).count(), 1)

    def test_legacy_generate_lab_number_links_existing_test_lab_number(self):
        self.first.lab_number = "BT-26-0044"
        self.first.save(update_fields=["lab_number"])

        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/generate_lab_number/",
            {"test_id": self.first.pk, "collection_clinic": self.hq.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["accession_number"], "BT-26-0044")
        self.assertEqual(
            LabSampleBatch.objects.filter(order=self.order).count(),
            1,
        )
        self.assertEqual(
            LabSampleBatch.objects.get(order=self.order).collection_clinic_id,
            self.hq.pk,
        )

    def test_collection_accession_uses_sanitized_collection_clinic_code(self):
        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.first.pk], "collection_clinic": self.hq.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertRegex(
            response.data["sample_batch"]["accession_number"],
            r"^LAB-API-HQ-\d{2}-\d{4}$",
        )

    def test_selected_tests_in_one_collection_share_batch_accession(self):
        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.first.pk, self.second.pk], "collection_clinic": self.hq.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual(self.first.sample_batch_id, self.second.sample_batch_id)
        self.assertEqual(self.first.lab_number, self.second.lab_number)
        self.assertEqual(
            self.first.lab_number,
            response.data["sample_batch"]["accession_number"],
        )
        self.assertEqual(
            response.data["tests"][0]["accession_number"],
            response.data["sample_batch"]["accession_number"],
        )

    def test_later_collection_receives_new_accession_for_new_physical_batch(self):
        first_response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.first.pk], "collection_clinic": self.hq.pk},
            format="json",
        )
        second_response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.second.pk], "collection_clinic": self.tin_can.pk},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK, first_response.data)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK, second_response.data)
        self.assertNotEqual(
            first_response.data["sample_batch"]["accession_number"],
            second_response.data["sample_batch"]["accession_number"],
        )
        self.assertRegex(
            second_response.data["sample_batch"]["accession_number"],
            r"^TIN-CAN-\d{2}-\d{4}$",
        )

    def test_legacy_order_lab_number_is_preserved_when_new_batch_is_collected(self):
        self.order.lab_number = "BT-26-0042"
        self.order.save(update_fields=["lab_number"])

        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.first.pk], "collection_clinic": self.hq.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.lab_number, "BT-26-0042")
        self.assertNotEqual(
            response.data["sample_batch"]["accession_number"],
            self.order.lab_number,
        )

    def test_collection_preserves_existing_test_lab_number_but_serializes_batch_accession(self):
        self.first.lab_number = "BT-26-0043"
        self.first.save(update_fields=["lab_number"])

        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.first.pk], "collection_clinic": self.hq.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        self.assertEqual(self.first.lab_number, "BT-26-0043")
        self.assertNotEqual(
            response.data["tests"][0]["accession_number"],
            self.first.lab_number,
        )
        self.assertEqual(
            response.data["tests"][0]["accession_number"],
            response.data["sample_batch"]["accession_number"],
        )

    def test_route_creates_audit_activity(self):
        from audit.models import ActivityLog

        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(ActivityLog.objects.filter(object_type="lab_test_routing").exists())

    def test_route_requires_access_to_order_origin(self):
        origin_only = create_test_user("lab-routing-origin-only", pages=["/laboratory"], system_role="Laboratory Scientist")
        origin_only.location_clinic = self.bode
        origin_only.active_clinic = self.bode
        origin_only.save()
        origin_only.location_clinics.add(self.bode)
        self.client.force_authenticate(user=origin_only)
        self.order.processing_clinic = self.bode
        self.order.save(update_fields=["processing_clinic"])

        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
        })

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.first.refresh_from_db()
        self.assertEqual(self.first.routing_status, "pending_triage")

    def test_hq_origin_only_user_can_list_order_processing_at_bode(self):
        origin_only = create_test_user("lab-routing-hq-origin", pages=["/laboratory"], system_role="Laboratory Scientist")
        origin_only.location_clinic = self.hq
        origin_only.active_clinic = self.hq
        origin_only.save()
        origin_only.location_clinics.add(self.hq)
        self.client.force_authenticate(user=origin_only)
        self.order.processing_clinic = self.bode
        self.order.save(update_fields=["processing_clinic"])

        response = self.client.get("/api/v1/laboratory/orders/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(self.order.pk, [row["id"] for row in response.data["results"]])

    def test_bode_worklist_includes_hq_origin_line_processed_at_bode_not_other_facility(self):
        processing_only = create_test_user("lab-routing-line-bode", pages=["/laboratory"], system_role="Laboratory Scientist")
        processing_only.location_clinic = self.bode
        processing_only.active_clinic = self.bode
        processing_only.save()
        processing_only.location_clinics.add(self.bode)
        self.first.processing_clinic = self.bode
        self.first.save(update_fields=["processing_clinic"])

        other_order = LabOrder.objects.create(
            order_id="LAB-API-OTHER-LINE",
            patient=self.patient,
            location_clinic=self.other,
            processing_clinic=self.other,
        )
        other_test = LabTest.objects.create(
            order=other_order,
            name="Other Facility Test",
            code="LAB-OTHER",
            sample_type="blood",
            processing_clinic=self.other,
        )
        self.client.force_authenticate(user=processing_only)

        response = self.client.get("/api/v1/laboratory/tests/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        test_ids = [row["id"] for row in response.data["results"]]
        self.assertIn(self.first.pk, test_ids)
        self.assertNotIn(other_test.pk, test_ids)

    def test_bode_processing_only_user_can_list_hq_origin_order(self):
        processing_only = create_test_user("lab-routing-bode-processing", pages=["/laboratory"], system_role="Laboratory Scientist")
        processing_only.location_clinic = self.bode
        processing_only.active_clinic = self.bode
        processing_only.save()
        processing_only.location_clinics.add(self.bode)
        self.client.force_authenticate(user=processing_only)
        self.order.processing_clinic = self.bode
        self.order.save(update_fields=["processing_clinic"])

        response = self.client.get("/api/v1/laboratory/orders/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(self.order.pk, [row["id"] for row in response.data["results"]])

    def test_collection_is_denied_to_unrelated_facility(self):
        unauthorized = create_test_user("lab-routing-unrelated", pages=["/laboratory"], system_role="Laboratory Scientist")
        unauthorized.location_clinic = self.other
        unauthorized.active_clinic = self.other
        unauthorized.save()
        unauthorized.location_clinics.add(self.other)
        self.client.force_authenticate(user=unauthorized)

        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/collect-samples/",
            {"test_ids": [self.first.pk], "collection_clinic": self.other.pk},
            format="json",
        )

        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_internal_reroute_cancels_issued_dispatch_and_clears_external_state(self):
        external = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "external",
            "external_destination": "Reference Lab",
            "reason": "Returned to reference lab",
        })
        dispatch = LabReferralDispatch.objects.get(pk=external.data["dispatch"]["id"])

        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
            "reason": "Returned to internal processing",
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        dispatch.refresh_from_db()
        self.assertEqual(self.first.processing_method, "in_house")
        self.assertEqual(self.first.outsourced_lab, "")
        self.assertIsNone(self.first.processed_by_id)
        self.assertIsNone(self.first.processed_at)
        self.assertEqual(dispatch.status, "cancelled")
        self.assertEqual(dispatch.cancellation_reason, "Returned to internal processing")
        self.assertTrue(dispatch.tests.filter(pk=self.first.pk).exists())

    def test_legacy_dispatch_cancellation_clears_routing_state_and_records_event(self):
        self.first.processing_clinic = self.hq
        self.first.save(update_fields=["processing_clinic"])
        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatch_outsourced/",
            {
                "test_ids": [self.first.pk],
                "partner_name": "Reference Lab",
                "reason": "No local reagent available",
            },
            format="json",
        )
        dispatch_id = response.data["id"]

        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatches/{dispatch_id}/cancel/",
            {"reason": "Partner unavailable"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        self.assertEqual(self.first.routing_status, "pending_triage")
        event = LabTestRoutingEvent.objects.filter(test=self.first).latest("changed_at")
        self.assertEqual(event.destination_type, "internal")
        self.assertEqual(event.to_clinic_id, self.hq.pk)
        self.assertEqual(event.reason, "Partner unavailable")

    def test_legacy_dispatch_cancellation_leaves_terminal_tests_unchanged(self):
        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatch_outsourced/",
            {
                "test_ids": [self.first.pk, self.second.pk],
                "partner_name": "Reference Lab",
                "reason": "No local reagent available",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        dispatch_id = response.data["id"]
        self.second.status = "verified"
        self.second.routing_status = "referred_external"
        self.second.save(update_fields=["status", "routing_status"])
        terminal_event_count = LabTestRoutingEvent.objects.filter(test=self.second).count()

        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatches/{dispatch_id}/cancel/",
            {"reason": "Partner unavailable"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual(self.first.routing_status, "pending_triage")
        self.assertEqual(self.first.status, "sample_collected")
        self.assertEqual(self.second.status, "verified")
        self.assertEqual(self.second.routing_status, "referred_external")
        self.assertEqual(
            LabTestRoutingEvent.objects.filter(test=self.second).count(),
            terminal_event_count,
        )

    def test_internal_partial_reroute_supersedes_old_dispatch_with_remaining_tests(self):
        external = self._route({
            "test_ids": [self.first.pk, self.second.pk],
            "destination_type": "external",
            "external_destination": "Reference Lab",
            "reason": "Returned to reference lab",
        })
        dispatch = LabReferralDispatch.objects.get(pk=external.data["dispatch"]["id"])

        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
            "reason": "Returned to internal processing",
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        dispatch.refresh_from_db()
        self.assertEqual(dispatch.status, "superseded")
        replacement = dispatch.superseded_by
        self.assertIsNotNone(replacement)
        self.assertEqual(replacement.status, "issued")
        self.assertEqual(list(replacement.tests.values_list("pk", flat=True)), [self.second.pk])
        self.assertEqual(set(dispatch.tests.values_list("pk", flat=True)), {self.first.pk, self.second.pk})

    def test_dispatch_mutation_is_denied_to_unrelated_facility(self):
        unauthorized = create_test_user("lab-routing-dispatch-unrelated", pages=["/laboratory"], system_role="Laboratory Scientist")
        unauthorized.location_clinic = self.other
        unauthorized.active_clinic = self.other
        unauthorized.save()
        unauthorized.location_clinics.add(self.other)
        self.client.force_authenticate(user=unauthorized)

        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatch_outsourced/",
            {"test_ids": [self.first.pk], "partner_name": "Reference Lab"},
            format="json",
        )

        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_legacy_dispatch_updates_routing_state_and_requires_reason(self):
        missing_reason = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatch_outsourced/",
            {"test_ids": [self.first.pk], "partner_name": "Reference Lab"},
            format="json",
        )
        self.assertEqual(missing_reason.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatch_outsourced/",
            {
                "test_ids": [self.first.pk],
                "partner_name": "Reference Lab",
                "reason": "No local reagent available",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.first.refresh_from_db()
        self.assertEqual(self.first.routing_status, "referred_external")
        self.assertTrue(LabTestRoutingEvent.objects.filter(test=self.first).exists())

    def test_legacy_dispatch_rejects_overlapping_active_dispatch(self):
        payload = {
            "test_ids": [self.first.pk],
            "partner_name": "Reference Lab",
            "reason": "No local reagent available",
        }
        first = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatch_outsourced/", payload, format="json"
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        second = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatch_outsourced/", payload, format="json"
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_legacy_dispatch_supersede_must_cover_every_selected_test(self):
        first = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatch_outsourced/",
            {
                "test_ids": [self.first.pk],
                "partner_name": "Reference Lab",
                "reason": "No local reagent available",
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)

        response = self.client.post(
            f"/api/v1/laboratory/orders/{self.order.pk}/dispatch_outsourced/",
            {
                "test_ids": [self.first.pk, self.second.pk],
                "partner_name": "Another Lab",
                "reason": "Change partner",
                "supersede_dispatch_id": first.data["id"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cover", response.data["error"])

    def test_order_patch_cannot_change_processing_clinic_but_route_action_can(self):
        response = self.client.patch(
            f"/api/v1/laboratory/orders/{self.order.pk}/",
            {"processing_clinic": self.other.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.processing_clinic_id, self.hq.pk)

        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
            "reason": "Route through Bode",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        self.assertEqual(self.first.processing_clinic_id, self.bode.pk)

    def test_route_allows_authorized_all_clinic_user_to_use_unassigned_destination(self):
        all_clinic_user = create_test_user(
            "lab-routing-all-clinics",
            pages=["/laboratory"],
            system_role="Laboratory Scientist",
        )
        all_clinic_user.location_clinic = self.hq
        all_clinic_user.active_clinic = self.hq
        all_clinic_user.save()
        all_clinic_user.location_clinics.add(self.hq)
        role = Role.objects.create(
            name="Lab all-clinic routing role",
            type="clinical",
            permissions={"pages": ["/laboratory"], "capabilities": ["clinical_data_view_all"]},
            is_active=True,
        )
        UserRole.objects.create(user=all_clinic_user, role=role)
        self.client.force_authenticate(user=all_clinic_user)

        response = self._route({
            "test_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
            "reason": "Use another facility",
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_route_rejects_terminal_or_cancelled_tests(self):
        for result_status in ("results_ready", "verified", "rejected"):
            test = LabTest.objects.create(
                order=self.order,
                name=f"{result_status} test",
                code=f"LAB-{result_status}",
                sample_type="blood",
                status=result_status,
            )
            response = self._route({
                "test_ids": [test.pk],
                "destination_type": "external",
                "external_destination": "Reference Lab",
            })
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            test.refresh_from_db()
            self.assertEqual(test.status, result_status)

        cancelled = LabTest.objects.create(
            order=self.order,
            name="cancelled test",
            code="LAB-CANCELLED",
            sample_type="blood",
            routing_status="cancelled",
        )
        response = self._route({
            "test_ids": [cancelled.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        cancelled.refresh_from_db()
        self.assertEqual(cancelled.routing_status, "cancelled")
