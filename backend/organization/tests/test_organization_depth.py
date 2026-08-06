"""Organization depth tests — Room, SystemConfig, WorkLocation models and API."""
from rest_framework.test import APITestCase
from rest_framework import status

from common.tests.support import create_test_user
from organization.models import Clinic, Department, Room, SystemConfig, WorkLocation


class RoomModelTest(APITestCase):
    """Model-level tests for Room."""

    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name="Room Test Clinic", code="RTC01")
        cls.department = Department.objects.create(
            location_clinic=cls.clinic, name="Surgery", code="SURG"
        )

    def test_create_room_defaults(self):
        room = Room.objects.create(
            name="Consultation A",
            room_number="R-001",
            location_clinic=self.clinic,
        )
        self.assertEqual(room.room_type, "consultation")
        self.assertEqual(room.status, "active")
        self.assertTrue(room.is_active)
        self.assertEqual(room.capacity, 1)

    def test_create_room_with_type_and_capacity(self):
        room = Room.objects.create(
            name="Emergency Bay",
            room_number="R-002",
            location_clinic=self.clinic,
            room_type="emergency",
            capacity=4,
        )
        self.assertEqual(room.room_type, "emergency")
        self.assertEqual(room.capacity, 4)

    def test_room_str(self):
        room = Room.objects.create(
            name="Exam Room", room_number="R-003", location_clinic=self.clinic
        )
        self.assertEqual(str(room), "R-003 - Exam Room")

    def test_room_department_relationship(self):
        room = Room.objects.create(
            name="OR-1",
            room_number="R-004",
            location_clinic=self.clinic,
            department=self.department,
            room_type="procedure",
        )
        self.assertEqual(room.department, self.department)
        self.assertIn(room, self.department.rooms.all())


class RoomAPITest(APITestCase):
    """API tests for /api/v1/organization/rooms/"""

    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("room_admin", pages=["/admin/clinics", "/admin"])
        cls.clinic = Clinic.objects.create(name="API Clinic", code="APIC01")

    def setUp(self):
        self.client.force_authenticate(user=self.admin)

    def test_create_room_via_api(self):
        resp = self.client.post("/api/v1/organization/rooms/", {
            "name": "Room A",
            "room_number": "API-R001",
            "location_clinic": self.clinic.id,
            "room_type": "consultation",
            "capacity": 2,
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["room_number"], "API-R001")
        self.assertEqual(resp.data["capacity"], 2)

    def test_list_rooms(self):
        Room.objects.create(name="L1", room_number="LR-001")
        resp = self.client.get("/api/v1/organization/rooms/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_update_room_status(self):
        room = Room.objects.create(
            name="Maint Room", room_number="MR-001"
        )
        resp = self.client.patch(
            f"/api/v1/organization/rooms/{room.id}/",
            {"status": "maintenance"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        room.refresh_from_db()
        self.assertEqual(room.status, "maintenance")

    def test_delete_room(self):
        room = Room.objects.create(
            name="Del Room", room_number="DR-001"
        )
        resp = self.client.delete(f"/api/v1/organization/rooms/{room.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Room.objects.filter(id=room.id).exists())

    def test_filter_rooms_by_type(self):
        Room.objects.create(
            name="ER", room_number="FT-001", location_clinic=self.clinic, room_type="emergency"
        )
        Room.objects.create(
            name="Consult", room_number="FT-002", location_clinic=self.clinic, room_type="consultation"
        )
        resp = self.client.get("/api/v1/organization/rooms/?room_type=emergency")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertTrue(all(r["room_type"] == "emergency" for r in results))


class SystemConfigModelTest(APITestCase):
    """Model-level tests for SystemConfig."""

    def test_create_config(self):
        cfg = SystemConfig.objects.create(
            key="feature_flag_x", value="true", description="Test flag"
        )
        self.assertEqual(str(cfg), "feature_flag_x")

    def test_is_enabled_true(self):
        SystemConfig.objects.create(key="enabled_flag", value="true")
        self.assertTrue(SystemConfig.is_enabled("enabled_flag"))

    def test_is_enabled_false_missing(self):
        self.assertFalse(SystemConfig.is_enabled("nonexistent_key"))

    def test_is_enabled_default(self):
        self.assertTrue(SystemConfig.is_enabled("missing_key", default=True))

    def test_get_value(self):
        SystemConfig.objects.create(key="max_retries", value={"count": 5})
        val = SystemConfig.get_value("max_retries")
        self.assertEqual(val, {"count": 5})

    def test_get_value_default(self):
        val = SystemConfig.get_value("no_such_key", default="fallback")
        self.assertEqual(val, "fallback")

    def test_update_config(self):
        cfg = SystemConfig.objects.create(key="toggle", value="off")
        cfg.value = "on"
        cfg.save()
        cfg.refresh_from_db()
        self.assertEqual(cfg.value, "on")

    def test_unique_key_constraint(self):
        SystemConfig.objects.create(key="unique_test", value="1")
        with self.assertRaises(Exception):
            SystemConfig.objects.create(key="unique_test", value="2")


class SystemConfigAPITest(APITestCase):
    """API tests for /api/v1/organization/system-config/ (read-only)."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("cfg_reader", pages=["/admin"])
        SystemConfig.objects.create(key="api_test_key", value="hello")

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_list_system_config(self):
        resp = self.client.get("/api/v1/organization/system-config/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_retrieve_system_config(self):
        cfg = SystemConfig.objects.get(key="api_test_key")
        resp = self.client.get(f"/api/v1/organization/system-config/{cfg.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["key"], "api_test_key")

    def test_create_not_allowed(self):
        resp = self.client.post("/api/v1/organization/system-config/", {
            "key": "new_key", "value": "v"
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class WorkLocationModelTest(APITestCase):
    """Model-level tests for WorkLocation."""

    def test_create_work_location(self):
        loc = WorkLocation.objects.create(name="Lagos Port Complex")
        self.assertTrue(loc.is_active)
        self.assertEqual(str(loc), "Lagos Port Complex")

    def test_unique_name_constraint(self):
        WorkLocation.objects.create(name="HQ Marina")
        with self.assertRaises(Exception):
            WorkLocation.objects.create(name="HQ Marina")

    def test_deactivate_work_location(self):
        loc = WorkLocation.objects.create(name="Onne Port")
        loc.is_active = False
        loc.save()
        loc.refresh_from_db()
        self.assertFalse(loc.is_active)


class WorkLocationAPITest(APITestCase):
    """API tests for /api/v1/organization/work-locations/ (read-only)."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user("wl_reader", pages=["/admin"])
        WorkLocation.objects.create(name="Apapa Port")
        WorkLocation.objects.create(name="Tin Can Island", is_active=False)

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    def test_list_work_locations(self):
        resp = self.client.get("/api/v1/organization/work-locations/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_filter_active_only(self):
        resp = self.client.get("/api/v1/organization/work-locations/?is_active=true")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        self.assertTrue(all(r["is_active"] for r in results))

    def test_create_not_allowed(self):
        resp = self.client.post("/api/v1/organization/work-locations/", {
            "name": "New Port"
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
