"""Tests for Pharmacy HOD store access and workflows."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from organization.models import Clinic, Department
from pharmacy.central_store import CENTRAL_STORE_CLINIC_CODE
from pharmacy.hod_store import (
    HOD_STORE_LOCATION,
    user_is_pharmacy_hod,
)
from pharmacy.models import HodStockIssue, MedicationInventory
from pharmacy.tests.test_pharmacy_depth import _make_medication
from common.tests.support import create_test_user

User = get_user_model()


class HodStoreAccessTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(
            name="Bode Thomas Clinic",
            code=CENTRAL_STORE_CLINIC_CODE,
        )
        cls.dept = Department.objects.create(
            clinic=cls.clinic,
            name="Pharmacy",
            code="PHARM",
        )
        cls.head = User.objects.create_user(
            username="pharm_head",
            email="head@test.com",
            password="pass",
        )
        cls.deputy = User.objects.create_user(
            username="pharm_deputy",
            email="deputy@test.com",
            password="pass",
        )
        cls.other = User.objects.create_user(
            username="other_user",
            email="other@test.com",
            password="pass",
        )
        cls.dept.head = cls.head
        cls.dept.deputy_head = cls.deputy
        cls.dept.save(update_fields=["head", "deputy_head"])

    def test_primary_head_is_pharmacy_hod(self):
        self.assertTrue(user_is_pharmacy_hod(self.head))

    def test_deputy_is_not_pharmacy_hod(self):
        self.assertFalse(user_is_pharmacy_hod(self.deputy))

    def test_other_user_is_not_pharmacy_hod(self):
        self.assertFalse(user_is_pharmacy_hod(self.other))

    def test_superuser_is_pharmacy_hod(self):
        su = User.objects.create_superuser("su", "su@test.com", "pass")
        self.assertTrue(user_is_pharmacy_hod(su))


class HodStockIssueAPITest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(
            name="Bode Thomas Clinic",
            code=CENTRAL_STORE_CLINIC_CODE,
        )
        cls.dept = Department.objects.create(
            clinic=cls.clinic,
            name="Pharmacy",
            code="PHARM",
        )
        cls.head = create_test_user(
            "hod_head",
            pages=["/pharmacy/hod-store", "/pharmacy/hod-store/history"],
            superuser=False,
        )
        cls.dept.head = cls.head
        cls.dept.save(update_fields=["head"])
        cls.head.clinic = cls.clinic
        cls.head.active_clinic = cls.clinic
        cls.head.save(update_fields=["clinic", "active_clinic"])

        cls.medication, _generic = _make_medication(name="Test Drug HOD", code="TST-HOD-001")
        cls.batch = MedicationInventory.objects.create(
            medication=cls.medication,
            batch_number="HOD-B1",
            expiry_date="2030-12-31",
            quantity=Decimal("100"),
            unit="Tablet",
            location=HOD_STORE_LOCATION,
            location_clinic=cls.clinic,
        )

    def setUp(self):
        self.client.force_authenticate(user=self.head)

    def test_head_can_list_hod_issues(self):
        resp = self.client.get("/api/v1/pharmacy/hod-stock-issues/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_head_can_issue_from_hod_store(self):
        resp = self.client.post(
            "/api/v1/pharmacy/hod-stock-issues/",
            {
                "medication": self.medication.pk,
                "quantity": "5",
                "reason": "Department use",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["issue_id"].startswith("HOD-"))
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, Decimal("95"))
        self.assertEqual(HodStockIssue.objects.count(), 1)

    def test_deputy_cannot_access_hod_issues(self):
        deputy = create_test_user("hod_deputy", pages=["/pharmacy/hod-store"])
        self.dept.deputy_head = deputy
        self.dept.save(update_fields=["deputy_head"])
        self.client.force_authenticate(user=deputy)
        resp = self.client.get("/api/v1/pharmacy/hod-stock-issues/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_hod_stock_request_create(self):
        resp = self.client.post(
            "/api/v1/pharmacy/stock-requests/",
            {
                "from_location": "Store",
                "to_location": HOD_STORE_LOCATION,
                "notes": "Restock HOD",
                "items": [{"medication": self.medication.pk, "quantity": 10}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["to_location"], HOD_STORE_LOCATION)


class DispensaryStockRequestAccessTest(APITestCase):
    """Dispensary staff may create Store→Dispensary requests without central-store operator role."""

    @classmethod
    def setUpTestData(cls):
        cls.medication, cls.generic = _make_medication()
        cls.clinic = Clinic.objects.create(name="Satellite Clinic", code="SAT-01")
        cls.dispensary_user = create_test_user(
            "disp_pharm",
            pages=["/pharmacy/inventory", "/pharmacy/requests"],
        )
        cls.dispensary_user.clinic = cls.clinic
        cls.dispensary_user.save(update_fields=["clinic"])

    def test_dispensary_pharmacist_can_create_store_to_dispensary_request(self):
        self.client.force_authenticate(user=self.dispensary_user)
        resp = self.client.post(
            "/api/v1/pharmacy/stock-requests/",
            {
                "from_location": "Store",
                "to_location": "Dispensary",
                "notes": "Restock dispensary",
                "items": [{"medication": self.medication.pk, "quantity": 10}],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)

    def test_dispensary_pharmacist_cannot_approve_store_request(self):
        self.client.force_authenticate(user=self.dispensary_user)
        create_resp = self.client.post(
            "/api/v1/pharmacy/stock-requests/",
            {
                "from_location": "Store",
                "to_location": "Dispensary",
                "items": [{"medication": self.medication.pk, "quantity": 10}],
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        approve_resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{create_resp.data['id']}/approve/"
        )
        self.assertEqual(approve_resp.status_code, status.HTTP_403_FORBIDDEN)


class CentralStoreApproveStockRequestTest(APITestCase):
    """Assigned Bode Thomas store staff can approve without active clinic at Bode Thomas."""

    @classmethod
    def setUpTestData(cls):
        from organization.models import SystemConfig

        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled",
            defaults={"value": "true", "description": "test"},
        )
        cls.central = Clinic.objects.create(name="Bode Thomas Clinic", code="BODE-THOMAS")
        cls.other = Clinic.objects.create(name="Apapa Port Clinic", code="APAPA")
        cls.medication, cls.generic = _make_medication()
        cls.dispensary_user = create_test_user(
            "disp_requester",
            pages=["/pharmacy/requests"],
        )
        cls.dispensary_user.clinic = cls.other
        cls.dispensary_user.save(update_fields=["clinic"])
        cls.store_staff = create_test_user(
            "store_approver",
            pages=["/pharmacy/store", "/pharmacy/store/requests"],
        )
        cls.store_staff.clinic = cls.central
        cls.store_staff.active_clinic = cls.other
        cls.store_staff.save(update_fields=["clinic", "active_clinic"])
        cls.store_staff.clinics.add(cls.central, cls.other)

    def test_approve_store_to_dispensary_request(self):
        self.client.force_authenticate(user=self.dispensary_user)
        create_resp = self.client.post(
            "/api/v1/pharmacy/stock-requests/",
            {
                "from_location": "Store",
                "to_location": "Dispensary",
                "items": [{"medication": self.medication.pk, "quantity": 10}],
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.data)
        self.client.force_authenticate(user=self.store_staff)
        approve_resp = self.client.post(
            f"/api/v1/pharmacy/stock-requests/{create_resp.data['id']}/approve/"
        )
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK, approve_resp.data)
        self.assertEqual(approve_resp.data["status"], "approved")

class PharmacyHodUserManagementTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(
            name="Bode Thomas Clinic",
            code="BODE-THOMAS",
        )
        cls.dept = Department.objects.create(
            clinic=cls.clinic,
            name="Pharmacy",
            code="PHARM",
        )
        cls.hod = User.objects.create_user(
            username="pharm_hod_um",
            password="testpass123",
            department=cls.dept,
        )
        cls.dept.head = cls.hod
        cls.dept.save(update_fields=["head"])
        cls.dept_member = User.objects.create_user(
            username="pharm_staff",
            password="testpass123",
            department=cls.dept,
        )

    def test_pharmacy_hod_can_manage_users_without_admin_page_on_role(self):
        from permissions.user_management import can_manage_users, managed_department_ids
        from permissions.user_pages import get_user_allowed_pages

        self.assertTrue(can_manage_users(self.hod))
        self.assertIn("/admin/users", get_user_allowed_pages(self.hod))
        self.assertEqual(managed_department_ids(self.hod), {self.dept.id})
