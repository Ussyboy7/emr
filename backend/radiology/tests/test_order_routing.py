from datetime import date
from django.db import IntegrityError
from django.db import transaction
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from organization.models import Clinic
from organization.models import SystemConfig
from patients.models import Patient
from common.tests.support import create_test_user
from radiology.models import (
    RadiologyOrder,
    RadiologyReferralDispatch,
    RadiologyStudy,
    RadiologyStudyRoutingEvent,
)
from permissions.models import Role, UserRole

User = get_user_model()


class RadiologyOrderRoutingModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.bode_thomas = Clinic.objects.create(name="Bode Thomas", code="BODE")
        cls.patient = Patient.objects.create(
            patient_id="ROUTING-RAD-01",
            surname="Routing",
            first_name="Radiology",
            gender="female",
            date_of_birth=date(1990, 1, 1),
        )
        cls.order = RadiologyOrder.objects.create(
            order_id="RAD-ROUTING-01",
            patient=cls.patient,
        )

    def test_radiology_studies_have_independent_destinations(self):
        first = RadiologyStudy.objects.create(order=self.order, procedure="Chest X-Ray")
        second = RadiologyStudy.objects.create(order=self.order, procedure="MRI Brain")

        first.processing_clinic = self.bode_thomas
        second.outsourced_facility = "External Imaging Centre"
        first.save()
        second.save()
        first.refresh_from_db()
        second.refresh_from_db()

        self.assertEqual(first.processing_clinic_id, self.bode_thomas.id)
        self.assertEqual(second.outsourced_facility, "External Imaging Centre")

    def test_study_processing_clinic_name_uses_study_destination(self):
        order_clinic = Clinic.objects.create(name="Order Origin", code="ORDER-ORIGIN")
        study_clinic = Clinic.objects.create(name="Study Destination", code="STUDY-DEST")
        order = RadiologyOrder.objects.create(
            order_id="RAD-ROUTING-SERIALIZER",
            patient=self.patient,
            processing_clinic=order_clinic,
        )
        study = RadiologyStudy.objects.create(
            order=order,
            procedure="MRI Brain",
            processing_clinic=study_clinic,
        )

        from radiology.serializers import RadiologyStudySerializer

        self.assertEqual(
            RadiologyStudySerializer(study).data["processing_clinic_name"],
            "Study Destination",
        )

    def test_study_processing_clinic_name_falls_back_to_order_destination(self):
        order = RadiologyOrder.objects.create(
            order_id="RAD-ROUTING-SERIALIZER-FALLBACK",
            patient=self.patient,
            processing_clinic=self.bode_thomas,
        )
        study = RadiologyStudy.objects.create(
            order=order,
            procedure="MRI Brain",
            processing_clinic=None,
        )

        from radiology.serializers import RadiologyStudySerializer

        self.assertEqual(
            RadiologyStudySerializer(study).data["processing_clinic_name"],
            "Bode Thomas",
        )

    def test_routing_event_constraints_allow_matching_destinations(self):
        study = RadiologyStudy.objects.create(order=self.order, procedure="Chest X-Ray")

        RadiologyStudyRoutingEvent.objects.create(
            study=study,
            destination_type="internal",
            to_clinic=self.bode_thomas,
        )
        RadiologyStudyRoutingEvent.objects.create(
            study=study,
            destination_type="external",
            external_destination="External Imaging Centre",
        )

    def test_routing_event_constraints_reject_missing_destinations(self):
        study = RadiologyStudy.objects.create(order=self.order, procedure="MRI Brain")

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                RadiologyStudyRoutingEvent.objects.create(study=study, destination_type="internal")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                RadiologyStudyRoutingEvent.objects.create(study=study, destination_type="external")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                RadiologyStudyRoutingEvent.objects.create(
                    study=study,
                    destination_type="internal",
                    to_clinic=self.bode_thomas,
                    external_destination="External Imaging Centre",
                )

    def test_existing_status_and_routing_status_remain_independent(self):
        study = RadiologyStudy.objects.create(
            order=self.order,
            procedure="Ultrasound Abdomen",
            status="reported",
            routing_status="referred_external",
        )

        self.assertEqual(study.status, "reported")
        self.assertEqual(study.routing_status, "referred_external")


class RadiologyOrderRoutingApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled",
            defaults={"value": "true"},
        )
        cls.hq = Clinic.objects.create(name="Rad API HQ", code="RAD-API-HQ")
        cls.bode = Clinic.objects.create(name="Rad API Bode", code="RAD-API-BODE")
        cls.hq.default_processing_clinic = cls.bode
        cls.hq.save(update_fields=["default_processing_clinic"])
        cls.other = Clinic.objects.create(name="Rad API Other", code="RAD-API-OTHER")
        cls.patient = Patient.objects.create(
            patient_id="RAD-API-PT",
            surname="API",
            first_name="Radiology",
            gender="female",
            date_of_birth=date(1990, 1, 1),
        )
        cls.user = create_test_user("rad-routing-api", pages=["/radiology"], system_role="Radiology Scientist")
        cls.user.location_clinic = cls.hq
        cls.user.active_clinic = cls.hq
        cls.user.save()
        cls.user.location_clinics.add(cls.hq, cls.bode)
        cls.rad_role = Role.objects.create(
            name="Radiology routing role",
            type="clinical",
            permissions={"pages": ["/radiology"]},
            is_active=True,
        )
        UserRole.objects.create(user=cls.user, role=cls.rad_role)

    def setUp(self):
        self.client.force_authenticate(user=self.user)
        self.order = RadiologyOrder.objects.create(
            order_id=f"RAD-API-{RadiologyOrder.objects.count() + 1}",
            patient=self.patient,
            location_clinic=self.hq,
            processing_clinic=self.hq,
        )
        self.first = RadiologyStudy.objects.create(order=self.order, procedure="Chest X-Ray")
        self.second = RadiologyStudy.objects.create(order=self.order, procedure="MRI Brain")

    def _route(self, payload):
        return self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/route-studies/",
            payload,
            format="json",
        )

    def test_route_mixed_destinations_changes_selected_studies_only(self):
        response = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
            "reason": "Bode modality available",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual(self.first.processing_clinic_id, self.bode.pk)
        self.assertEqual(self.first.routing_status, "sent_to_processing")
        self.assertEqual(self.second.routing_status, "pending_triage")
        self.assertEqual(RadiologyStudyRoutingEvent.objects.filter(study=self.first).count(), 1)
        self.assertEqual(len(response.data["lines"]), 1)
        self.assertEqual(len(response.data["routing_events"]), 1)

    def test_processing_clinic_filters_list_and_stats_without_changing_origin_filter(self):
        other_order = RadiologyOrder.objects.create(
            order_id="RAD-API-PROCESSING-FILTER",
            patient=self.patient,
            location_clinic=self.bode,
            processing_clinic=self.hq,
        )
        RadiologyStudy.objects.create(order=other_order, procedure="Other study")

        response = self.client.get(
            "/api/v1/radiology/orders/",
            {"processing_clinic": self.hq.pk, "location_clinic": self.hq.pk},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data["results"]], [self.order.pk])

        stats = self.client.get(
            "/api/v1/radiology/orders/stats/",
            {"processing_clinic": self.hq.pk, "location_clinic": self.hq.pk},
        )
        self.assertEqual(stats.status_code, status.HTTP_200_OK)
        self.assertEqual(stats.data["total"], 1)

    def test_line_processing_clinic_is_included_in_order_list_scope(self):
        other_order = RadiologyOrder.objects.create(
            order_id="RAD-API-LINE-SCOPE",
            patient=self.patient,
            location_clinic=self.other,
            processing_clinic=self.other,
        )
        RadiologyStudy.objects.create(
            order=other_order,
            procedure="Line-routed study",
            processing_clinic=self.bode,
        )

        response = self.client.get(
            "/api/v1/radiology/orders/",
            {"processing_clinic": self.bode.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(other_order.pk, [row["id"] for row in response.data["results"]])

    def test_generic_radiology_study_patch_cannot_change_routing_fields(self):
        response = self.client.patch(
            f"/api/v1/radiology/studies/{self.first.pk}/",
            {"processing_clinic": self.bode.pk, "routing_status": "sent_to_processing"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.first.refresh_from_db()
        self.assertIsNone(self.first.processing_clinic_id)
        self.assertEqual(self.first.routing_status, "pending_triage")

    def test_external_route_requires_nonblank_reason(self):
        response = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "external",
            "external_destination": "Reference Imaging",
            "reason": "  ",
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_route_requires_radiology_capability(self):
        for user_role in UserRole.objects.filter(user=self.user).select_related("role"):
            user_role.role.permissions = {"pages": [], "capabilities": []}
            user_role.role.save(update_fields=["permissions"])
        self.user._cached_capabilities = None
        response = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_route_external_requires_destination_and_dispatches_exact_lines(self):
        response = self._route({"study_ids": [self.first.pk], "destination_type": "external"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "external",
            "external_destination": "Reference Imaging",
            "reason": "Reference imaging required",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.first.refresh_from_db()
        self.assertEqual(self.first.status, "processing")
        self.assertEqual(response.data["dispatch"]["studies"][0]["id"], self.first.pk)

    def test_route_rejects_empty_selection_and_unassigned_destination(self):
        response = self._route({"study_ids": [], "destination_type": "internal", "processing_clinic": self.hq.pk})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.other.pk,
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_internal_route_requires_processing_clinic(self):
        response = self._route({"study_ids": [self.first.pk], "destination_type": "internal"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_route_creates_audit_activity(self):
        from audit.models import ActivityLog

        response = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(ActivityLog.objects.filter(object_type="radiology_study_routing").exists())

    def test_route_requires_access_to_order_origin(self):
        origin_only = create_test_user("rad-routing-origin-only", pages=["/radiology"], system_role="Radiology Scientist")
        origin_only.location_clinic = self.bode
        origin_only.active_clinic = self.bode
        origin_only.save()
        origin_only.location_clinics.add(self.bode)
        self.client.force_authenticate(user=origin_only)
        self.order.processing_clinic = self.bode
        self.order.save(update_fields=["processing_clinic"])

        response = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
        })

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.first.refresh_from_db()
        self.assertEqual(self.first.routing_status, "pending_triage")

    def test_hq_origin_only_user_can_list_order_processing_at_bode(self):
        origin_only = create_test_user("rad-routing-hq-origin", pages=["/radiology"], system_role="Radiology Scientist")
        origin_only.location_clinic = self.hq
        origin_only.active_clinic = self.hq
        origin_only.save()
        origin_only.location_clinics.add(self.hq)
        self.client.force_authenticate(user=origin_only)
        self.order.processing_clinic = self.bode
        self.order.save(update_fields=["processing_clinic"])

        response = self.client.get("/api/v1/radiology/orders/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(self.order.pk, [row["id"] for row in response.data["results"]])

    def test_bode_processing_only_user_can_list_hq_origin_order(self):
        processing_only = create_test_user("rad-routing-bode-processing", pages=["/radiology"], system_role="Radiology Scientist")
        processing_only.location_clinic = self.bode
        processing_only.active_clinic = self.bode
        processing_only.save()
        processing_only.location_clinics.add(self.bode)
        self.client.force_authenticate(user=processing_only)
        self.order.processing_clinic = self.bode
        self.order.save(update_fields=["processing_clinic"])

        response = self.client.get("/api/v1/radiology/orders/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(self.order.pk, [row["id"] for row in response.data["results"]])

    def test_bode_worklist_includes_hq_origin_line_processed_at_bode_not_other_facility(self):
        processing_only = create_test_user("rad-routing-line-bode", pages=["/radiology"], system_role="Radiology Scientist")
        processing_only.location_clinic = self.bode
        processing_only.active_clinic = self.bode
        processing_only.save()
        processing_only.location_clinics.add(self.bode)
        self.first.processing_clinic = self.bode
        self.first.save(update_fields=["processing_clinic"])

        other_order = RadiologyOrder.objects.create(
            order_id="RAD-API-OTHER-LINE",
            patient=self.patient,
            location_clinic=self.other,
            processing_clinic=self.other,
        )
        other_study = RadiologyStudy.objects.create(
            order=other_order,
            procedure="Other Facility Study",
            processing_clinic=self.other,
        )
        self.client.force_authenticate(user=processing_only)

        response = self.client.get("/api/v1/radiology/studies/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        study_ids = [row["id"] for row in response.data["results"]]
        self.assertIn(self.first.pk, study_ids)
        self.assertNotIn(other_study.pk, study_ids)

    def test_dispatch_mutation_is_denied_to_unrelated_facility(self):
        unauthorized = create_test_user("rad-routing-dispatch-unrelated", pages=["/radiology"], system_role="Radiology Scientist")
        unauthorized.location_clinic = self.other
        unauthorized.active_clinic = self.other
        unauthorized.save()
        unauthorized.location_clinics.add(self.other)
        self.client.force_authenticate(user=unauthorized)

        response = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatch_outsourced/",
            {"study_ids": [self.first.pk], "partner_name": "Reference Imaging"},
            format="json",
        )

        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_legacy_dispatch_updates_routing_state_and_requires_reason(self):
        missing_reason = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatch_outsourced/",
            {"study_ids": [self.first.pk], "partner_name": "Reference Imaging"},
            format="json",
        )
        self.assertEqual(missing_reason.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatch_outsourced/",
            {
                "study_ids": [self.first.pk],
                "partner_name": "Reference Imaging",
                "reason": "No local modality available",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.first.refresh_from_db()
        self.assertEqual(self.first.routing_status, "referred_external")
        self.assertTrue(RadiologyStudyRoutingEvent.objects.filter(study=self.first).exists())

    def test_legacy_dispatch_rejects_overlapping_active_dispatch(self):
        payload = {
            "study_ids": [self.first.pk],
            "partner_name": "Reference Imaging",
            "reason": "No local modality available",
        }
        first = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatch_outsourced/", payload, format="json"
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        second = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatch_outsourced/", payload, format="json"
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_legacy_dispatch_supersede_must_cover_every_selected_study(self):
        first = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatch_outsourced/",
            {
                "study_ids": [self.first.pk],
                "partner_name": "Reference Imaging",
                "reason": "No local modality available",
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)

        response = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatch_outsourced/",
            {
                "study_ids": [self.first.pk, self.second.pk],
                "partner_name": "Another Imaging Centre",
                "reason": "Change partner",
                "supersede_dispatch_id": first.data["id"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cover", response.data["error"])

    def test_legacy_dispatch_cancellation_clears_routing_state_and_records_event(self):
        self.first.processing_clinic = self.hq
        self.first.save(update_fields=["processing_clinic"])
        response = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatch_outsourced/",
            {
                "study_ids": [self.first.pk],
                "partner_name": "Reference Imaging",
                "reason": "No local modality available",
            },
            format="json",
        )
        dispatch_id = response.data["id"]

        response = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatches/{dispatch_id}/cancel/",
            {"reason": "Partner unavailable"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        self.assertEqual(self.first.routing_status, "pending_triage")
        event = RadiologyStudyRoutingEvent.objects.filter(study=self.first).latest("changed_at")
        self.assertEqual(event.destination_type, "internal")
        self.assertEqual(event.to_clinic_id, self.hq.pk)
        self.assertEqual(event.reason, "Partner unavailable")

    def test_legacy_dispatch_cancellation_leaves_terminal_studies_unchanged(self):
        response = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatch_outsourced/",
            {
                "study_ids": [self.first.pk, self.second.pk],
                "partner_name": "Reference Imaging",
                "reason": "No local modality available",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        dispatch_id = response.data["id"]
        self.second.status = "verified"
        self.second.routing_status = "referred_external"
        self.second.save(update_fields=["status", "routing_status"])
        terminal_event_count = RadiologyStudyRoutingEvent.objects.filter(study=self.second).count()

        response = self.client.post(
            f"/api/v1/radiology/orders/{self.order.pk}/dispatches/{dispatch_id}/cancel/",
            {"reason": "Partner unavailable"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual(self.first.routing_status, "pending_triage")
        self.assertEqual(self.first.status, "pending")
        self.assertEqual(self.second.status, "verified")
        self.assertEqual(self.second.routing_status, "referred_external")
        self.assertEqual(
            RadiologyStudyRoutingEvent.objects.filter(study=self.second).count(),
            terminal_event_count,
        )

    def test_order_patch_cannot_change_processing_clinic_but_route_action_can(self):
        response = self.client.patch(
            f"/api/v1/radiology/orders/{self.order.pk}/",
            {"processing_clinic": self.other.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.processing_clinic_id, self.hq.pk)

        response = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
            "reason": "Route through Bode",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        self.assertEqual(self.first.processing_clinic_id, self.bode.pk)

    def test_route_allows_authorized_all_clinic_user_to_use_unassigned_destination(self):
        all_clinic_user = create_test_user(
            "rad-routing-all-clinics",
            pages=["/radiology"],
            system_role="Radiology Scientist",
        )
        all_clinic_user.location_clinic = self.hq
        all_clinic_user.active_clinic = self.hq
        all_clinic_user.save()
        all_clinic_user.location_clinics.add(self.hq)
        role = Role.objects.create(
            name="Radiology all-clinic routing role",
            type="clinical",
            permissions={"pages": ["/radiology"], "capabilities": ["clinical_data_view_all"]},
            is_active=True,
        )
        UserRole.objects.create(user=all_clinic_user, role=role)
        self.client.force_authenticate(user=all_clinic_user)

        response = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
            "reason": "Use another facility",
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_internal_reroute_cancels_issued_dispatch_and_clears_external_state(self):
        external = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "external",
            "external_destination": "Reference Imaging",
            "reason": "Returned to reference imaging",
        })
        dispatch = RadiologyReferralDispatch.objects.get(pk=external.data["dispatch"]["id"])

        response = self._route({
            "study_ids": [self.first.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
            "reason": "Returned to internal processing",
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.first.refresh_from_db()
        dispatch.refresh_from_db()
        self.assertEqual(self.first.processing_method, "in_house")
        self.assertEqual(self.first.outsourced_facility, "")
        self.assertEqual(dispatch.status, "cancelled")
        self.assertEqual(dispatch.cancellation_reason, "Returned to internal processing")
        self.assertTrue(dispatch.studies.filter(pk=self.first.pk).exists())

    def test_internal_partial_reroute_supersedes_old_dispatch_with_remaining_studies(self):
        external = self._route({
            "study_ids": [self.first.pk, self.second.pk],
            "destination_type": "external",
            "external_destination": "Reference Imaging",
            "reason": "Returned to reference imaging",
        })
        dispatch = RadiologyReferralDispatch.objects.get(pk=external.data["dispatch"]["id"])

        response = self._route({
            "study_ids": [self.first.pk],
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
        self.assertEqual(list(replacement.studies.values_list("pk", flat=True)), [self.second.pk])
        self.assertEqual(set(dispatch.studies.values_list("pk", flat=True)), {self.first.pk, self.second.pk})

    def test_route_rejects_terminal_or_cancelled_studies(self):
        for result_status in ("reported", "verified"):
            study = RadiologyStudy.objects.create(
                order=self.order,
                procedure=f"{result_status} study",
                status=result_status,
            )
            response = self._route({
                "study_ids": [study.pk],
                "destination_type": "external",
                "external_destination": "Reference Imaging",
            })
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            study.refresh_from_db()
            self.assertEqual(study.status, result_status)

        cancelled = RadiologyStudy.objects.create(
            order=self.order,
            procedure="cancelled study",
            routing_status="cancelled",
        )
        response = self._route({
            "study_ids": [cancelled.pk],
            "destination_type": "internal",
            "processing_clinic": self.bode.pk,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        cancelled.refresh_from_db()
        self.assertEqual(cancelled.routing_status, "cancelled")
