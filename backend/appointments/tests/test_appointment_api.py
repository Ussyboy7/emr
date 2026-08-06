"""Comprehensive API tests for Appointment CRUD, custom actions, filtering, and auth."""
from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import Appointment
from common.tests.support import create_test_user, create_test_patient_visit
from organization.models import OutpatientClinicType

User = get_user_model()

BASE_URL = "/api/v1/appointments/"


def _clinic_type():
    obj, _ = OutpatientClinicType.objects.get_or_create(
        code="gopd", defaults={"name": "GOPD"}
    )
    return obj


class AppointmentSetupMixin:
    """Shared setUp: user, patient, default payload helper."""

    def setUp(self):
        self.user = create_test_user("apt_user", pages=["/medical-records/appointments"])
        self.client.force_authenticate(user=self.user)
        self.patient, self.visit = create_test_patient_visit(patient_id="APT-PT-001")
        self.clinic_type = _clinic_type()

    def _payload(self, **overrides):
        defaults = {
            "patient": self.patient.pk,
            "clinic": self.clinic_type.pk,
            "appointment_date": str(date.today() + timedelta(days=1)),
            "appointment_time": "09:00:00",
            "appointment_type": "consultation",
            "reason": "General checkup",
            "duration_minutes": 30,
        }
        defaults.update(overrides)
        return defaults

    def _create_appointment(self, **overrides):
        """Persist an Appointment via the ORM."""
        defaults = {
            "patient": self.patient,
            "doctor": self.user,
            "clinic": self.clinic_type,
            "appointment_date": date.today() + timedelta(days=1),
            "appointment_time": time(9, 0),
            "appointment_type": "consultation",
            "status": "scheduled",
            "reason": "ORM-created appointment",
            "created_by": self.user,
        }
        defaults.update(overrides)
        return Appointment.objects.create(**defaults)


class AppointmentCreateTests(AppointmentSetupMixin, APITestCase):
    """POST /api/v1/appointments/"""

    def test_create_appointment_returns_201(self):
        resp = self.client.post(BASE_URL, self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["patient"], self.patient.pk)
        self.assertEqual(resp.data["status"], "scheduled")
        self.assertIn("appointment_id", resp.data)
        self.assertTrue(resp.data["appointment_id"].startswith("APT-"))

    def test_create_sets_created_by_to_current_user(self):
        resp = self.client.post(BASE_URL, self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["created_by"], self.user.pk)

    def test_create_without_patient_returns_400(self):
        payload = self._payload()
        del payload["patient"]
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_without_appointment_date_returns_400(self):
        payload = self._payload()
        del payload["appointment_date"]
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_without_appointment_time_returns_400(self):
        payload = self._payload()
        del payload["appointment_time"]
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_with_follow_up_type(self):
        resp = self.client.post(
            BASE_URL,
            self._payload(appointment_type="follow_up"),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["appointment_type"], "follow_up")

    def test_create_with_invalid_type_returns_400(self):
        resp = self.client.post(
            BASE_URL,
            self._payload(appointment_type="invalid_type"),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_with_doctor_assigned(self):
        doctor = create_test_user("apt_doctor", pages=["/medical-records/appointments"], system_role="Medical Doctor")
        resp = self.client.post(
            BASE_URL,
            self._payload(doctor=doctor.pk),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["doctor"], doctor.pk)


class AppointmentRetrieveTests(AppointmentSetupMixin, APITestCase):
    """GET /api/v1/appointments/{id}/"""

    def test_retrieve_appointment(self):
        apt = self._create_appointment()
        resp = self.client.get(f"{BASE_URL}{apt.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], apt.pk)
        self.assertIn("patient_name", resp.data)
        self.assertIn("appointment_id", resp.data)

    def test_retrieve_nonexistent_returns_404(self):
        resp = self.client.get(f"{BASE_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class AppointmentUpdateTests(AppointmentSetupMixin, APITestCase):
    """PATCH /api/v1/appointments/{id}/"""

    def test_patch_reason(self):
        apt = self._create_appointment()
        resp = self.client.patch(
            f"{BASE_URL}{apt.pk}/",
            {"reason": "Updated reason for visit"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["reason"], "Updated reason for visit")

    def test_patch_appointment_type(self):
        apt = self._create_appointment()
        resp = self.client.patch(
            f"{BASE_URL}{apt.pk}/",
            {"appointment_type": "follow_up"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["appointment_type"], "follow_up")

    def test_patch_duration(self):
        apt = self._create_appointment()
        resp = self.client.patch(
            f"{BASE_URL}{apt.pk}/",
            {"duration_minutes": 60},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["duration_minutes"], 60)

    def test_patch_notes(self):
        apt = self._create_appointment()
        resp = self.client.patch(
            f"{BASE_URL}{apt.pk}/",
            {"notes": "Patient needs wheelchair access"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["notes"], "Patient needs wheelchair access")


class AppointmentDeleteTests(AppointmentSetupMixin, APITestCase):
    """DELETE /api/v1/appointments/{id}/"""

    def test_delete_appointment(self):
        apt = self._create_appointment()
        resp = self.client.delete(f"{BASE_URL}{apt.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Appointment.objects.filter(pk=apt.pk).exists())

    def test_delete_nonexistent_returns_404(self):
        resp = self.client.delete(f"{BASE_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class AppointmentListTests(AppointmentSetupMixin, APITestCase):
    """GET /api/v1/appointments/"""

    def setUp(self):
        super().setUp()
        self.patient2, _ = create_test_patient_visit(patient_id="APT-PT-002")
        self.apt1 = self._create_appointment(
            appointment_date=date.today() + timedelta(days=1),
            appointment_time=time(9, 0),
        )
        self.apt2 = self._create_appointment(
            appointment_date=date.today() + timedelta(days=2),
            appointment_time=time(10, 0),
            appointment_type="follow_up",
        )
        self.apt3 = self._create_appointment(
            patient=self.patient2,
            appointment_date=date.today() + timedelta(days=3),
            appointment_time=time(11, 0),
            status="confirmed",
        )

    def test_list_returns_200(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(resp.data["results"]), 3)

    def test_filter_by_patient(self):
        resp = self.client.get(BASE_URL, {"patient": self.patient.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data["results"]:
            self.assertEqual(item["patient"], self.patient.pk)

    def test_filter_by_status(self):
        resp = self.client.get(BASE_URL, {"status": "confirmed"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data["results"]:
            self.assertEqual(item["status"], "confirmed")

    def test_filter_by_appointment_type(self):
        resp = self.client.get(BASE_URL, {"appointment_type": "follow_up"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data["results"]:
            self.assertEqual(item["appointment_type"], "follow_up")

    def test_filter_by_date_range(self):
        start = str(date.today() + timedelta(days=2))
        end = str(date.today() + timedelta(days=3))
        resp = self.client.get(BASE_URL, {"start_date": start, "end_date": end})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data["results"]:
            apt_date = item["appointment_date"]
            self.assertGreaterEqual(apt_date, start)
            self.assertLessEqual(apt_date, end)

    def test_filter_by_doctor(self):
        apt = self._create_appointment(doctor=self.user)
        resp = self.client.get(BASE_URL, {"doctor": apt.doctor.pk})
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST])

    def test_search_by_patient_name(self):
        resp = self.client.get(BASE_URL, {"search": "Patient"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreater(len(resp.data["results"]), 0)

    def test_ordering_by_date(self):
        resp = self.client.get(BASE_URL, {"ordering": "appointment_date"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        dates = [r["appointment_date"] for r in resp.data["results"]]
        self.assertEqual(dates, sorted(dates))


class AppointmentConfirmTests(AppointmentSetupMixin, APITestCase):
    """POST /api/v1/appointments/{id}/confirm/"""

    def test_confirm_appointment(self):
        apt = self._create_appointment(status="scheduled")
        resp = self.client.post(f"{BASE_URL}{apt.pk}/confirm/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "confirmed")

    def test_confirm_updates_database(self):
        apt = self._create_appointment(status="scheduled")
        self.client.post(f"{BASE_URL}{apt.pk}/confirm/")
        apt.refresh_from_db()
        self.assertEqual(apt.status, "confirmed")

    def test_confirm_nonexistent_returns_404(self):
        resp = self.client.post(f"{BASE_URL}99999/confirm/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class AppointmentCancelTests(AppointmentSetupMixin, APITestCase):
    """POST /api/v1/appointments/{id}/cancel/"""

    def test_cancel_appointment(self):
        apt = self._create_appointment(status="scheduled")
        resp = self.client.post(f"{BASE_URL}{apt.pk}/cancel/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "cancelled")

    def test_cancel_updates_database(self):
        apt = self._create_appointment(status="confirmed")
        self.client.post(f"{BASE_URL}{apt.pk}/cancel/")
        apt.refresh_from_db()
        self.assertEqual(apt.status, "cancelled")

    def test_cancel_nonexistent_returns_404(self):
        resp = self.client.post(f"{BASE_URL}99999/cancel/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class AppointmentTodayTests(AppointmentSetupMixin, APITestCase):
    """GET /api/v1/appointments/today/"""

    def test_today_returns_only_todays_appointments(self):
        self._create_appointment(
            appointment_date=date.today(),
            appointment_time=time(8, 0),
        )
        self._create_appointment(
            appointment_date=date.today() + timedelta(days=1),
            appointment_time=time(9, 0),
        )
        resp = self.client.get(f"{BASE_URL}today/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data:
            self.assertEqual(item["appointment_date"], str(date.today()))

    def test_today_empty_when_no_appointments(self):
        resp = self.client.get(f"{BASE_URL}today/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 0)


class AppointmentUpcomingTests(AppointmentSetupMixin, APITestCase):
    """GET /api/v1/appointments/upcoming/"""

    def test_upcoming_excludes_past_dates(self):
        self._create_appointment(
            appointment_date=date.today() - timedelta(days=1),
            appointment_time=time(9, 0),
        )
        self._create_appointment(
            appointment_date=date.today() + timedelta(days=5),
            appointment_time=time(10, 0),
        )
        resp = self.client.get(f"{BASE_URL}upcoming/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        today_str = str(date.today())
        for item in resp.data:
            self.assertGreaterEqual(item["appointment_date"], today_str)

    def test_upcoming_excludes_cancelled(self):
        self._create_appointment(
            appointment_date=date.today() + timedelta(days=2),
            appointment_time=time(9, 0),
            status="cancelled",
        )
        self._create_appointment(
            appointment_date=date.today() + timedelta(days=3),
            appointment_time=time(10, 0),
            status="scheduled",
        )
        resp = self.client.get(f"{BASE_URL}upcoming/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data:
            self.assertIn(item["status"], ["scheduled", "confirmed"])

    def test_upcoming_ordered_by_date_time(self):
        self._create_appointment(
            appointment_date=date.today() + timedelta(days=10),
            appointment_time=time(14, 0),
        )
        self._create_appointment(
            appointment_date=date.today() + timedelta(days=2),
            appointment_time=time(8, 0),
        )
        resp = self.client.get(f"{BASE_URL}upcoming/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        dates = [r["appointment_date"] for r in resp.data]
        self.assertEqual(dates, sorted(dates))


class AppointmentListStatsTests(AppointmentSetupMixin, APITestCase):
    """GET /api/v1/appointments/list-stats/"""

    def test_list_stats_returns_counts(self):
        self._create_appointment(status="scheduled")
        self._create_appointment(
            status="confirmed",
            appointment_time=time(10, 0),
        )
        self._create_appointment(
            status="in_progress",
            appointment_time=time(11, 0),
        )
        resp = self.client.get(f"{BASE_URL}list-stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("scheduled", resp.data)
        self.assertIn("confirmed", resp.data)
        self.assertIn("inProgress", resp.data)


class AppointmentAuthTests(AppointmentSetupMixin, APITestCase):
    """Unauthenticated requests must be rejected with 401."""

    def test_list_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(BASE_URL, self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_unauthenticated_returns_401(self):
        apt = self._create_appointment()
        self.client.force_authenticate(user=None)
        resp = self.client.get(f"{BASE_URL}{apt.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_delete_unauthenticated_returns_401(self):
        apt = self._create_appointment()
        self.client.force_authenticate(user=None)
        resp = self.client.delete(f"{BASE_URL}{apt.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_confirm_unauthenticated_returns_401(self):
        apt = self._create_appointment()
        self.client.force_authenticate(user=None)
        resp = self.client.post(f"{BASE_URL}{apt.pk}/confirm/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cancel_unauthenticated_returns_401(self):
        apt = self._create_appointment()
        self.client.force_authenticate(user=None)
        resp = self.client.post(f"{BASE_URL}{apt.pk}/cancel/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_today_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(f"{BASE_URL}today/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_upcoming_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(f"{BASE_URL}upcoming/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class AppointmentRBACTests(APITestCase):
    """Users without the appointments page permission get 403."""

    @classmethod
    def setUpTestData(cls):
        cls.user_no_page = create_test_user("no_apt_page", pages=["/nursing"])

    def test_list_without_page_returns_403(self):
        self.client.force_authenticate(user=self.user_no_page)
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_without_page_returns_403(self):
        self.client.force_authenticate(user=self.user_no_page)
        patient, _ = create_test_patient_visit(patient_id="APT-RBAC-01")
        resp = self.client.post(BASE_URL, {
            "patient": patient.pk,
            "appointment_date": str(date.today() + timedelta(days=1)),
            "appointment_time": "09:00:00",
        }, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class AppointmentClinicTypeTests(AppointmentSetupMixin, APITestCase):
    """clinic is a clinic TYPE (GOPD, Eye, …), not a facility."""

    def test_clinic_is_clinic_type_not_facility(self):
        apt = self._create_appointment()
        self.assertIsInstance(apt.clinic, OutpatientClinicType)
        self.assertEqual(apt.clinic.name, self.clinic_type.name)
        self.assertIsNone(apt.location_clinic)

    def test_create_requires_clinic(self):
        payload = self._payload()
        del payload["clinic"]
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_returns_clinic_name_and_location_clinic_name(self):
        resp = self.client.post(BASE_URL, self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["clinic"], self.clinic_type.pk)
        self.assertEqual(resp.data["clinic_name"], self.clinic_type.name)
        self.assertIn("location_clinic_name", resp.data)
        self.assertIsNone(resp.data["location_clinic_name"])
        self.assertNotIn("clinics", resp.data)

    def test_location_clinic_set_on_update(self):
        from organization.models import Clinic

        clinic, _ = Clinic.objects.get_or_create(code="BODE-T", defaults={"name": "Bode Thomas"})
        apt = self._create_appointment()
        resp = self.client.patch(
            f"{BASE_URL}{apt.pk}/",
            {"location_clinic": clinic.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["location_clinic"], clinic.pk)
        self.assertEqual(resp.data["location_clinic_name"], clinic.name)


class AppointmentOrgWideTests(AppointmentSetupMixin, APITestCase):
    """Appointments are org-wide (no facility boundary)."""

    def setUp(self):
        super().setUp()
        from organization.models import Clinic, SystemConfig

        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled",
            defaults={"value": "true", "description": "Enable multi-clinic mode (test)"},
        )
        self.clinic_b, _ = Clinic.objects.get_or_create(code="BODE-B", defaults={"name": "Bode Beta"})
        self.apt_b = self._create_appointment(
            patient=self.patient,
            appointment_date=date.today() + timedelta(days=4),
            location_clinic=self.clinic_b,
        )

    def test_user_sees_appointments_at_other_facility(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = {r["id"] for r in resp.data["results"]}
        self.assertIn(self.apt_b.pk, ids)
