"""
Tests for backfill_role_capabilities management command.
"""
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from permissions.capabilities import ALL_CAPABILITY_IDS
from permissions.models import Role
from permissions.role_permissions import (
    normalize_role_capabilities_list,
    normalize_role_permissions_list,
)


class BackfillRoleCapabilitiesTests(TestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(
            name="System Administrator",
            type="admin",
            permissions=["/admin", "/admin/users"],
            is_active=True,
        )
        self.records_role = Role.objects.create(
            name="Medical Records Officer",
            type="records",
            permissions=["/medical-records/patients"],
            is_active=True,
        )

    def test_dry_run_does_not_persist(self):
        out = StringIO()
        call_command(
            "backfill_role_capabilities",
            "--admin-types",
            "--name-presets",
            stdout=out,
        )
        self.admin_role.refresh_from_db()
        self.assertEqual(normalize_role_capabilities_list(self.admin_role.permissions), [])

    def test_apply_admin_role_gets_all_capabilities(self):
        call_command(
            "backfill_role_capabilities",
            "--apply",
            "--admin-types",
            "--no-bump-users",
            role=["System Administrator"],
        )
        self.admin_role.refresh_from_db()
        caps = set(normalize_role_capabilities_list(self.admin_role.permissions))
        self.assertEqual(caps, set(ALL_CAPABILITY_IDS))
        pages = normalize_role_permissions_list(self.admin_role.permissions)
        self.assertIn("/admin", pages)

    def test_apply_name_preset_for_records_role(self):
        call_command(
            "backfill_role_capabilities",
            "--apply",
            "--name-presets",
            "--no-bump-users",
            role=["Medical Records Officer"],
        )
        self.records_role.refresh_from_db()
        caps = set(normalize_role_capabilities_list(self.records_role.permissions))
        self.assertIn("patient_convert_csr", caps)
        self.assertIn("patient_promote_officer", caps)
