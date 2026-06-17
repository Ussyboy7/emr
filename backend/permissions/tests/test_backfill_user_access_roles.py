from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from io import StringIO

from permissions.models import Role, UserRole

User = get_user_model()


class BackfillUserAccessRolesTests(TestCase):
    def setUp(self):
        self.role = Role.objects.create(
            name="Nursing Officer",
            type="nurse",
            permissions=["/nursing"],
            is_active=True,
        )
        self.user = User.objects.create_user(
            username="legacy_nurse",
            email="legacy@example.com",
            password="pass",
            system_role="Nursing Officer",
        )

    def test_dry_run_does_not_create_assignment(self):
        out = StringIO()
        call_command("backfill_user_access_roles", stdout=out)
        self.assertFalse(UserRole.objects.filter(user=self.user).exists())
        self.assertIn("WOULD CREATE", out.getvalue())

    def test_apply_creates_user_role(self):
        call_command("backfill_user_access_roles", "--apply", "--no-bump-users")
        ur = UserRole.objects.get(user=self.user)
        self.assertEqual(ur.role_id, self.role.id)
        self.user.refresh_from_db()
        self.assertEqual(self.user.system_role, "Nursing Officer")

    def test_skips_when_no_system_role(self):
        bare = User.objects.create_user(username="bare", password="pass")
        out = StringIO()
        call_command("backfill_user_access_roles", "--apply", stdout=out)
        self.assertFalse(UserRole.objects.filter(user=bare).exists())
