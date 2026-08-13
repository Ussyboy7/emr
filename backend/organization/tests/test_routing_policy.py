from django.test import TestCase
from rest_framework.exceptions import PermissionDenied

from organization.models import Clinic
from organization.routing import ensure_internal_processing_destination, required_processing_clinic


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
