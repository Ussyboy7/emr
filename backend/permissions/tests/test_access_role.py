from django.contrib.auth import get_user_model
from django.test import TestCase

from permissions.access_role import get_primary_user_role, sync_system_role_from_access_role
from permissions.models import Role, UserRole

User = get_user_model()


class AccessRoleHelpersTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="access_test",
            email="access@test.local",
            password="test-pass-123",
        )
        self.role = Role.objects.create(
            name="Pool Nurse",
            type="nurse",
            permissions=["/nursing/pool-queue"],
            is_active=True,
        )

    def test_primary_user_role_and_system_role_sync(self):
        UserRole.objects.create(user=self.user, role=self.role)
        primary = get_primary_user_role(self.user)
        self.assertIsNotNone(primary)
        self.assertEqual(primary.role_id, self.role.id)

        updated = sync_system_role_from_access_role(self.user)
        self.assertTrue(updated)
        self.user.refresh_from_db()
        self.assertEqual(self.user.system_role, "Pool Nurse")

        self.assertFalse(sync_system_role_from_access_role(self.user))
