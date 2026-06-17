"""Shared helpers for Django integration tests."""
from __future__ import annotations

from datetime import date, time

from django.contrib.auth import get_user_model

from organization.models import Clinic, Department
from patients.models import Patient, Visit
from permissions.models import Role, UserRole

User = get_user_model()


def grant_pages(user, pages: list[str]) -> None:
    role = Role.objects.create(
        name=f"test-role-{user.pk}-{user.username}",
        type="custom",
        permissions=pages,
    )
    UserRole.objects.create(user=user, role=role)


def create_clinic_department(*, clinic_code: str, dept_code: str, dept_name: str):
    clinic = Clinic.objects.create(name=f"Clinic {clinic_code}", code=clinic_code)
    department = Department.objects.create(clinic=clinic, name=dept_name, code=dept_code)
    return clinic, department


def create_nursing_officer(username: str, *, clinic=None, department=None):
    """Nursing Officer with department hints satisfied for notify_role routing."""
    if clinic is None or department is None:
        clinic, department = create_clinic_department(
            clinic_code=f"C-{username}"[:50],
            dept_code="NURSING",
            dept_name="Nursing",
        )
    user = User.objects.create_user(
        username=username,
        password="testpass123",
        first_name="Nurse",
        last_name="Test",
        system_role="Nursing Officer",
        clinic=clinic,
        department=department,
    )
    grant_pages(user, ["/nursing/pool-queue", "/nursing"])
    return user


def create_test_user(
    username: str,
    *,
    pages: list[str] | None = None,
    superuser: bool = False,
    system_role: str = "",
):
    if superuser:
        user = User.objects.create_superuser(
            username=username,
            password="testpass123",
            email=f"{username}@test.local",
        )
        return user
    user = User.objects.create_user(
        username=username,
        password="testpass123",
        first_name="Test",
        last_name="User",
        system_role=system_role,
    )
    if pages:
        grant_pages(user, pages)
    return user


def create_test_patient_visit(*, patient_id: str = "TEST-PT-001", visit_status: str = "in_progress"):
    patient = Patient.objects.create(
        patient_id=patient_id,
        surname="Test",
        first_name="Patient",
        gender="male",
        date_of_birth=date(1990, 5, 15),
    )
    visit = Visit.objects.create(
        patient=patient,
        date=date.today(),
        time=time(10, 0),
        status=visit_status,
        visit_type="consultation",
        clinic="GOPD",
    )
    return patient, visit
