"""Tests for patient photo upload on create/update."""
from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from organization.models import Clinic, Department
from patients.models import Patient
from permissions.models import Role, UserRole

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


def _tiny_png_upload(name: str = "photo.png") -> SimpleUploadedFile:
    buf = BytesIO()
    Image.new("RGB", (2, 2), color="red").save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type="image/png")


@override_settings(MEDIA_ROOT="/tmp/emr-test-media")
class PatientPhotoUploadTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name="MR Clinic", code="MRC2")
        cls.dept = Department.objects.create(
            location_clinic=cls.clinic, name="Medical Records", code="MR2"
        )
        cls.mro = _user_with_pages(
            "mro-photo",
            ["/medical-records/patients", "/medical-records/patients/new"],
            department=cls.dept,
            system_role="Medical Records Officer",
        )
        cls.patient = Patient.objects.create(
            patient_id="E-PHOTO-001",
            category="employee",
            surname="Photo",
            first_name="Subject",
            gender="male",
            date_of_birth=date(1990, 1, 1),
            personal_number="PN-PHOTO-001",
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.mro)

    def test_create_patient_with_photo(self):
        upload = _tiny_png_upload()
        res = self.client.post(
            "/api/v1/patients/",
            {
                "category": "employee",
                "surname": "Snap",
                "first_name": "Shot",
                "gender": "female",
                "date_of_birth": "1992-02-02",
                "personal_number": "PN-PHOTO-NEW",
                "photo": upload,
                "is_active": True,
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        patient = Patient.objects.get(pk=res.data["id"])
        self.assertTrue(patient.photo.name)
        self.assertTrue(patient.photo.name.startswith("patients/photos/"))
        self.assertIsNotNone(res.data.get("photo"))

    def test_update_patient_with_photo(self):
        upload = _tiny_png_upload("updated.png")
        res = self.client.patch(
            f"/api/v1/patients/{self.patient.pk}/",
            {"photo": upload},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.patient.refresh_from_db()
        self.assertTrue(self.patient.photo.name)
        self.assertIsNotNone(res.data.get("photo"))

    def test_clear_patient_photo(self):
        upload = _tiny_png_upload("initial.png")
        self.client.patch(
            f"/api/v1/patients/{self.patient.pk}/",
            {"photo": upload},
            format="multipart",
        )
        self.patient.refresh_from_db()
        self.assertTrue(self.patient.photo.name)

        res = self.client.patch(
            f"/api/v1/patients/{self.patient.pk}/",
            {"clear_photo": True},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.patient.refresh_from_db()
        self.assertFalse(self.patient.photo)
