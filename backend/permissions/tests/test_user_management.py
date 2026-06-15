"""Tests for department-head user management permissions."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from organization.models import Clinic, Department
from permissions.models import Role, UserRole
from permissions.user_management import (
    can_manage_users,
    is_department_head,
    managed_department_ids,
)

User = get_user_model()


def _user_with_pages(username: str, pages: list[str], **kwargs) -> User:
    user = User.objects.create_user(
        username=username,
        password="testpass123",
        first_name="Test",
        last_name="User",
        **kwargs,
    )
    role = Role.objects.create(
        name=f"role-{username}",
        type="custom",
        permissions=pages,
    )
    UserRole.objects.create(user=user, role=role)
    return user


class UserManagementHelperTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name="Test Clinic", code="TC")
        cls.dept_a = Department.objects.create(
            clinic=cls.clinic, name="Dept A", code="DA"
        )
        cls.dept_b = Department.objects.create(
            clinic=cls.clinic, name="Dept B", code="DB"
        )

    def test_department_head_without_staff_flag(self):
        head = _user_with_pages(
            "dept-head",
            ["/admin/users"],
            department=self.dept_a,
        )
        self.dept_a.head = head
        self.dept_a.save(update_fields=["head"])
        self.assertTrue(is_department_head(head))
        self.assertTrue(can_manage_users(head))
        self.assertEqual(managed_department_ids(head), {self.dept_a.id})

    def test_non_head_with_users_page_cannot_manage(self):
        user = _user_with_pages(
            "not-head",
            ["/admin/users"],
            department=self.dept_a,
        )
        self.assertFalse(is_department_head(user))
        self.assertFalse(can_manage_users(user))

    def test_staff_can_manage_without_head_status(self):
        staff = _user_with_pages(
            "ict-staff",
            ["/admin"],
            department=self.dept_b,
            is_staff=True,
        )
        self.assertFalse(is_department_head(staff))
        self.assertTrue(can_manage_users(staff))
        self.assertEqual(managed_department_ids(staff), {self.dept_b.id})


class UserManagementHttpTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name="UM Clinic", code="UMC")
        cls.dept = Department.objects.create(
            clinic=cls.clinic, name="Medical Records", code="MR"
        )
        cls.other_dept = Department.objects.create(
            clinic=cls.clinic, name="Laboratory", code="LAB"
        )

        cls.head = _user_with_pages(
            "records-head",
            ["/admin/users"],
            department=cls.dept,
        )
        cls.dept.head = cls.head
        cls.dept.save(update_fields=["head"])

        cls.dept_member = User.objects.create_user(
            username="records-member",
            password="testpass123",
            department=cls.dept,
        )
        cls.other_member = User.objects.create_user(
            username="lab-member",
            password="testpass123",
            department=cls.other_dept,
        )

        cls.non_head = _user_with_pages(
            "records-staff",
            ["/admin/users"],
            department=cls.dept,
        )

    def setUp(self):
        self.client = APIClient()

    def test_department_head_can_list_users_in_department(self):
        self.client.force_authenticate(user=self.head)
        res = self.client.get("/api/v1/accounts/users/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        usernames = {row["username"] for row in res.data.get("results", res.data)}
        self.assertIn("records-member", usernames)
        self.assertNotIn("lab-member", usernames)

    def test_non_head_denied_user_list(self):
        self.client.force_authenticate(user=self.non_head)
        res = self.client.get("/api/v1/accounts/users/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_department_head_can_list_roles_for_dropdown(self):
        self.client.force_authenticate(user=self.head)
        res = self.client.get("/api/v1/permissions/roles/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_department_head_can_list_organization_lookups(self):
        self.client.force_authenticate(user=self.head)
        for path in (
            "/api/v1/organization/clinics/",
            "/api/v1/organization/departments/",
            "/api/v1/accounts/system-roles/",
        ):
            res = self.client.get(path)
            self.assertEqual(res.status_code, status.HTTP_200_OK, msg=path)

    def test_department_head_me_includes_headed_departments(self):
        self.client.force_authenticate(user=self.head)
        res = self.client.get("/api/v1/accounts/auth/me/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_department_head"])
        self.assertFalse(res.data["is_staff"])
        self.assertFalse(res.data["is_department_deputy"])
        self.assertEqual(len(res.data["headed_departments"]), 1)
        self.assertEqual(res.data["headed_departments"][0]["name"], "Medical Records")

    def test_deputy_head_can_manage_users_in_department(self):
        deputy = _user_with_pages(
            "records-deputy",
            ["/admin/users"],
            department=self.dept,
        )
        self.dept.deputy_head = deputy
        self.dept.save(update_fields=["deputy_head"])

        self.client.force_authenticate(user=deputy)
        res = self.client.get("/api/v1/accounts/users/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        usernames = {row["username"] for row in res.data.get("results", res.data)}
        self.assertIn("records-member", usernames)

        me = self.client.get("/api/v1/accounts/auth/me/")
        self.assertTrue(me.data["is_department_head"])
        self.assertTrue(me.data["is_department_deputy"])

    def test_department_cannot_have_same_head_and_deputy(self):
        admin = User.objects.create_superuser(
            username="ict-admin-deputy-test",
            password="x",
            email="deputy-test@example.com",
        )
        self.client.force_authenticate(user=admin)
        res = self.client.patch(
            f"/api/v1/organization/departments/{self.dept.id}/",
            {"deputy_head": self.head.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
