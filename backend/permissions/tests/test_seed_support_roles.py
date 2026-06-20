from django.test import TestCase

from permissions.models import Role
from permissions.support_roles import (
    ICT_SUPPORT_NAME,
    SENSITIVE_CAPABILITY_IDS,
    build_support_permissions_from_officer,
)
from permissions.role_permissions import normalize_role_permissions_list, normalize_role_capabilities_list


class SeedSupportRolesTests(TestCase):
    def setUp(self):
        self.officer = Role.objects.create(
            name="Medical Records Officer",
            type="records",
            permissions={
                "pages": [
                    "/medical-records",
                    "/medical-records/patients",
                    "/medical-records/coding",
                    "/medical-records/reports",
                    "/admin/users",
                ],
                "capabilities": [
                    "patient_merge",
                    "patient_convert_csr",
                ],
            },
            is_active=True,
        )

    def test_build_support_strips_admin_and_sensitive(self):
        payload = build_support_permissions_from_officer(self.officer)
        pages = normalize_role_permissions_list(payload)
        caps = normalize_role_capabilities_list(payload)

        self.assertIn("/medical-records/patients", pages)
        self.assertNotIn("/medical-records/coding", pages)
        self.assertNotIn("/medical-records/reports", pages)
        self.assertNotIn("/admin/users", pages)
        self.assertEqual(caps, [])
        self.assertTrue(SENSITIVE_CAPABILITY_IDS >= frozenset({"patient_merge", "patient_convert_csr"}))

    def test_seed_command_creates_support_role(self):
        from django.core.management import call_command

        call_command("seed_support_roles", "--apply")
        support = Role.objects.get(name="Medical Records Support")
        self.assertEqual(support.type, "records")
        pages = normalize_role_permissions_list(support.permissions)
        self.assertIn("/medical-records/patients", pages)
        self.assertNotIn("/medical-records/coding", pages)

        ict = Role.objects.get(name=ICT_SUPPORT_NAME)
        self.assertEqual(normalize_role_permissions_list(ict.permissions), [
            "/admin/users",
            "/admin/clinics",
            "/admin/health",
            "/admin/support-tickets",
        ])
