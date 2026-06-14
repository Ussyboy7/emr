"""HTTP integration tests for page-based API RBAC (patients, visits, vitals)."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from patients.models import Patient, Visit
from permissions.models import Role, UserRole

User = get_user_model()


def _user_with_pages(username: str, pages: list[str]) -> User:
    user = User.objects.create_user(
        username=username,
        password="testpass123",
        first_name="RBAC",
        last_name="Tester",
    )
    role = Role.objects.create(
        name=f"role-{username}",
        type="custom",
        permissions=pages,
    )
    UserRole.objects.create(user=user, role=role)
    return user


class RbacHttpPatientsVisitsVitalsTests(TestCase):
    """Enforce ApiPageAccessPermission on core clinical APIs."""

    @classmethod
    def setUpTestData(cls):
        cls.patient = Patient.objects.create(
            patient_id="RBAC-PT-001",
            surname="Test",
            first_name="Patient",
            gender="male",
            date_of_birth=date(1990, 1, 1),
        )
        cls.visit = Visit.objects.create(
            patient=cls.patient,
            date=date(2026, 6, 10),
            time=time(9, 0),
            status="in_progress",
        )

    def setUp(self):
        self.client = APIClient()

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_consultation_only_denied_patient_list(self):
        user = _user_with_pages("consult-list", ["/consultation/start"])
        self._auth(user)
        res = self.client.get("/api/v1/patients/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_consultation_only_allowed_patient_detail(self):
        user = _user_with_pages("consult-detail", ["/consultation/start"])
        self._auth(user)
        res = self.client.get(f"/api/v1/patients/{self.patient.pk}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_consultation_only_denied_patient_create(self):
        user = _user_with_pages("consult-create", ["/consultation/start"])
        self._auth(user)
        res = self.client.post(
            "/api/v1/patients/",
            {
                "category": "nonnpa",
                "nonnpa_type": "walkin",
                "surname": "New",
                "first_name": "Person",
                "gender": "female",
                "date_of_birth": "1995-03-01",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_records_role_allowed_patient_list_and_create(self):
        user = _user_with_pages(
            "records-user",
            ["/medical-records/patients", "/medical-records/patients/new"],
        )
        self._auth(user)
        list_res = self.client.get("/api/v1/patients/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)

        create_res = self.client.post(
            "/api/v1/patients/",
            {
                "category": "nonnpa",
                "nonnpa_type": "walkin",
                "surname": "Registered",
                "first_name": "ViaApi",
                "gender": "female",
                "date_of_birth": "1988-07-12",
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)

    def test_consultation_allowed_visit_create(self):
        user = _user_with_pages("consult-visit", ["/consultation/start"])
        self._auth(user)
        res = self.client.post(
            "/api/v1/visits/",
            {
                "patient": self.patient.pk,
                "date": "2026-06-11",
                "time": "11:00:00",
                "visit_type": "consultation",
                "status": "scheduled",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_consultation_allowed_visit_patch(self):
        user = _user_with_pages("consult-patch", ["/consultation/start"])
        self._auth(user)
        res = self.client.patch(
            f"/api/v1/visits/{self.visit.pk}/",
            {"clinical_notes": "RBAC patch test"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_records_read_only_denied_vitals_write(self):
        user = _user_with_pages("records-vitals", ["/medical-records/patient-records"])
        self._auth(user)
        res = self.client.post(
            "/api/v1/vitals/",
            {
                "visit": self.visit.pk,
                "patient": self.patient.pk,
                "temperature": 36.8,
                "heart_rate": 70,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_nursing_allowed_vitals_write(self):
        user = _user_with_pages("nursing-vitals", ["/nursing/patient-vitals"])
        self._auth(user)
        res = self.client.post(
            "/api/v1/vitals/",
            {
                "visit": self.visit.pk,
                "patient": self.patient.pk,
                "temperature": 37.1,
                "heart_rate": 72,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_consultation_only_denied_patient_update(self):
        user = _user_with_pages("consult-update", ["/consultation/start"])
        self._auth(user)
        res = self.client.patch(
            f"/api/v1/patients/{self.patient.pk}/",
            {"phone": "08000000000"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_bypasses_rbac(self):
        admin = User.objects.create_superuser(
            username="rbac-super",
            password="adminpass123",
            email="rbac-super@example.com",
        )
        self._auth(admin)
        res = self.client.get("/api/v1/patients/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
