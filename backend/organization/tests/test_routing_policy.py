from django.test import TestCase
from rest_framework.exceptions import PermissionDenied

from common.tests.support import create_test_user
from organization.models import Clinic
from organization.routing import (
    ensure_internal_processing_destination,
    ensure_internal_routing_destination,
    required_processing_clinic,
)


class ClinicRoutingPolicyTests(TestCase):
    def setUp(self):
        self.bode = Clinic.objects.create(name="Bode Thomas Clinic", code="BODE-THOMAS")
        self.tincan = Clinic.objects.create(
            name="Tincan Island Port Clinic",
            code="TINCAN",
            default_processing_clinic=self.bode,
        )
        self.hq = Clinic.objects.create(name="HQ Clinic (Marina)", code="HQ-MARINA")

    def test_lagos_feeder_uses_bode_as_required_destination(self):
        self.assertEqual(required_processing_clinic(self.tincan), self.bode)
        ensure_internal_processing_destination(self.tincan, self.bode)

    def test_hq_cannot_reroute_to_another_internal_clinic(self):
        with self.assertRaises(PermissionDenied):
            ensure_internal_processing_destination(self.hq, self.bode)


class OriginlessRoutingScopeTests(TestCase):
    def setUp(self):
        self.bode = Clinic.objects.create(name="Bode Thomas Clinic", code="BODE-THOMAS")
        self.tincan = Clinic.objects.create(
            name="Tincan Island Port Clinic",
            code="TINCAN",
            default_processing_clinic=self.bode,
        )
        self.hq = Clinic.objects.create(name="HQ Clinic (Marina)", code="HQ-MARINA")
        self.rivers = Clinic.objects.create(name="Rivers Port Clinic", code="RIVERS")
        self.hq_triage = create_test_user(
            "routing-hq-triage", pages=["/laboratory"], system_role="Laboratory Scientist"
        )
        self.hq_triage.location_clinic = self.hq
        self.hq_triage.active_clinic = self.hq
        self.hq_triage.save()
        self.hq_triage.location_clinics.add(self.hq)

    def test_originless_destinations_are_assigned_facilities_and_processing_hubs(self):
        # Allowed: the triage user's own facility (local processing) and the
        # configured processing hub (Bode, via Tin Can's default destination).
        for allowed in (self.hq, self.bode):
            ensure_internal_routing_destination(self.hq_triage, None, allowed)
        # Rejected: any other clinic.
        with self.assertRaises(PermissionDenied):
            ensure_internal_routing_destination(self.hq_triage, None, self.rivers)

    def test_originless_routing_does_not_grant_other_facilities(self):
        bode_user = create_test_user(
            "routing-bode-only", pages=["/laboratory"], system_role="Laboratory Scientist"
        )
        bode_user.location_clinic = self.bode
        bode_user.active_clinic = self.bode
        bode_user.save()
        bode_user.location_clinics.add(self.bode)

        ensure_internal_routing_destination(bode_user, None, self.bode)
        with self.assertRaises(PermissionDenied):
            ensure_internal_routing_destination(bode_user, None, self.hq)

    def test_known_origin_is_still_pinned_to_its_processing_clinic(self):
        ensure_internal_routing_destination(self.hq_triage, self.tincan, self.bode)
        with self.assertRaises(PermissionDenied):
            ensure_internal_routing_destination(self.hq_triage, self.tincan, self.hq)
