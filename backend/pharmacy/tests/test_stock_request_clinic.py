"""Tests for stock request clinic stamping and repair."""
from django.test import TestCase

from common.tests.support import create_test_user
from organization.models import Clinic, SystemConfig
from pharmacy.models import StockRequest
from pharmacy.stock_request_clinic import repair_stock_request_clinic


class StockRequestClinicRepairTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled",
            defaults={"value": "true", "description": "test"},
        )
        cls.clinic = Clinic.objects.create(name="Bode Thomas Clinic", code="BODE-THOMAS")
        cls.user = create_test_user("stock_requester", pages=["/pharmacy/requests"])
        cls.user.clinic = cls.clinic
        cls.user.save(update_fields=["clinic"])

    def test_repair_sets_clinic_from_requester_home_clinic(self):
        request = StockRequest.objects.create(
            from_location="Store",
            to_location="Dispensary",
            requested_by=self.user,
        )
        self.assertIsNone(request.clinic_id)

        repaired = repair_stock_request_clinic(request)
        self.assertEqual(repaired.clinic_id, self.clinic.id)

        request.refresh_from_db()
        self.assertEqual(request.clinic_id, self.clinic.id)

    def test_repair_uses_assigned_clinic_when_home_clinic_missing(self):
        user = create_test_user("rotational", pages=["/pharmacy/requests"])
        user.clinic = None
        user.active_clinic = None
        user.save(update_fields=["clinic", "active_clinic"])
        user.clinics.add(self.clinic)

        request = StockRequest.objects.create(
            from_location="Store",
            to_location="Dispensary",
            requested_by=user,
        )
        repaired = repair_stock_request_clinic(request)
        self.assertEqual(repaired.clinic_id, self.clinic.id)
