"""Tests for central store clinic access helpers."""
from django.contrib.auth import get_user_model
from django.test import TestCase

from organization.models import Clinic, SystemConfig
from pharmacy.central_store import (
    CENTRAL_STORE_CLINIC_CODE,
    get_central_store_clinic_id,
    user_assigned_to_central_store,
    user_can_operate_central_store,
)

User = get_user_model()


class CentralStoreAccessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled",
            defaults={
                "value": "true",
                "description": "Enable multi-clinic mode (test)",
            },
        )
        cls.central, _ = Clinic.objects.get_or_create(
            code=CENTRAL_STORE_CLINIC_CODE,
            defaults={"name": "Bode Thomas Clinic"},
        )
        cls.other, _ = Clinic.objects.get_or_create(
            code="TEST-OTHER-SITE",
            defaults={"name": "Other Test Clinic"},
        )
        cls.user = User.objects.create_user(username="store_pharm", password="x")
        cls.user.clinic = cls.central
        cls.user.active_clinic = cls.central
        cls.user.save()
        cls.user.clinics.add(cls.central)

    def test_get_central_store_clinic_id_uses_code(self):
        self.assertEqual(get_central_store_clinic_id(), self.central.id)

    def test_assigned_user_can_operate_when_active_is_central(self):
        self.assertTrue(user_assigned_to_central_store(self.user))
        self.assertTrue(user_can_operate_central_store(self.user))

    def test_assigned_user_cannot_operate_when_active_elsewhere(self):
        self.user.active_clinic = self.other
        self.user.save(update_fields=["active_clinic"])
        self.assertTrue(user_assigned_to_central_store(self.user))
        self.assertFalse(user_can_operate_central_store(self.user))
