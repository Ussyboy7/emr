from django.test import TestCase

from permissions.capabilities import ALL_CAPABILITY_IDS
from permissions.models import Role, UserRole
from permissions.user_capabilities import build_effective_access_for_role, get_user_capabilities
from django.contrib.auth import get_user_model

User = get_user_model()


class UserCapabilitiesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="cap_user",
            email="cap@test.local",
            password="test-pass-123",
        )
        self.role = Role.objects.create(
            name="Records Admin",
            type="records",
            permissions={
                "pages": ["/medical-records/patients"],
                "capabilities": ["patient_merge", "patient_delete"],
            },
            is_active=True,
        )
        UserRole.objects.create(user=self.user, role=self.role)

    def test_explicit_and_page_implied_capabilities(self):
        caps = get_user_capabilities(self.user)
        self.assertIn("patient_merge", caps)
        self.assertIn("patient_delete", caps)

    def test_effective_access_preview(self):
        preview = build_effective_access_for_role(self.role)
        self.assertIn("/medical-records/patients", preview["pages"])
        self.assertIn("patient_merge", preview["capabilities"])

    def test_admin_role_type_gets_all_capabilities(self):
        admin_role = Role.objects.create(
            name="ICT Admin",
            type="admin",
            permissions=["/admin"],
            is_active=True,
        )
        UserRole.objects.filter(user=self.user).delete()
        UserRole.objects.create(user=self.user, role=admin_role)
        caps = get_user_capabilities(self.user)
        self.assertEqual(caps, set(ALL_CAPABILITY_IDS))
