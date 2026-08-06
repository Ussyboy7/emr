"""Phase 2: patient chart is org-wide, operational reads stay facility-scoped.

A patient belongs to the organization, not a facility. Any authorized user must
see the full medical chart (visits, vitals, clinical overview) for a patient
regardless of the facility where each encounter occurred or the user's active
clinic. Operational worklists (e.g. the visit list) remain facility-scoped.
"""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from organization.models import Clinic, Department, SystemConfig
from patients.models import Patient, Visit, VitalReading
from permissions.models import Role, UserRole

User = get_user_model()


class PatientChartOrgWideTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        SystemConfig.objects.update_or_create(
            key="multi_clinic_enabled",
            defaults={"value": "true", "description": "Enable multi-clinic mode (test)"},
        )
        cls.hq, _ = Clinic.objects.get_or_create(code="TEST-HQ", defaults={"name": "HQ Test"})
        cls.bode, _ = Clinic.objects.get_or_create(code="TEST-BODE", defaults={"name": "Bode Thomas"})
        cls.apapa, _ = Clinic.objects.get_or_create(code="TEST-APAPA", defaults={"name": "Apapa"})

        cls.dept = Department.objects.create(
            location_clinic=cls.hq, name="Outpatient", code="OPD-TEST"
        )
        cls.doctor = User.objects.create_user(
            username="hq_doctor",
            password="testpass123",
            first_name="HQ",
            last_name="Doctor",
            department=cls.dept,
        )
        role = Role.objects.create(
            name="role-hq-doctor",
            type="custom",
            permissions=["/medical-records/patients", "/medical-records/visits"],
        )
        UserRole.objects.create(user=cls.doctor, role=role)
        cls.doctor.location_clinic = cls.hq
        cls.doctor.active_clinic = cls.hq
        cls.doctor.save()
        cls.doctor.location_clinics.add(cls.hq)

        cls.patient = Patient.objects.create(
            patient_id="CHART-PT-001",
            surname="Chart",
            first_name="Org",
            gender="female",
            date_of_birth=date(1992, 2, 2),
            location_clinic=cls.bode,
        )

        cls.bode_visit = Visit.objects.create(
            patient=cls.patient,
            date=date.today(),
            time=time(9, 0),
            visit_type="consultation",
            status="completed",
            clinic="GOPD",
            location_clinic=cls.bode,
        )
        cls.hq_visit = Visit.objects.create(
            patient=cls.patient,
            date=date.today(),
            time=time(10, 0),
            visit_type="consultation",
            status="completed",
            clinic="Eye",
            location_clinic=cls.hq,
        )
        cls.bode_vital = VitalReading.objects.create(
            patient=cls.patient,
            recorded_by=cls.doctor,
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            visit=cls.bode_visit,
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.doctor)

    def _patient_url(self):
        return f"/api/v1/patients/{self.patient.pk}/"

    def test_visits_chart_is_org_wide(self):
        res = self.client.get(f"{self._patient_url()}visits/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data}
        self.assertIn(self.bode_visit.id, ids)
        self.assertIn(self.hq_visit.id, ids)

    def test_vitals_chart_is_org_wide(self):
        res = self.client.get(f"{self._patient_url()}vitals/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)

    def test_clinical_overview_is_org_wide(self):
        res = self.client.get(f"{self._patient_url()}clinical-overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        visit_ids = {v["id"] for v in res.data.get("visits", [])}
        self.assertIn(self.bode_visit.id, visit_ids)
        self.assertIn(self.hq_visit.id, visit_ids)

    def test_visit_list_remains_facility_scoped(self):
        res = self.client.get("/api/v1/visits/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data["results"]}
        self.assertNotIn(self.bode_visit.id, ids)
        self.assertIn(self.hq_visit.id, ids)
