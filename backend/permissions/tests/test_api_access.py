"""Tests for API page-access RBAC."""
from django.test import SimpleTestCase

from permissions.api_access import check_api_page_access, normalize_api_path
from permissions.page_paths import is_path_allowed_by_pages


class PagePathMatchingTests(SimpleTestCase):
    def test_prefix_match(self):
        allowed = {"/nursing", "/settings"}
        self.assertTrue(is_path_allowed_by_pages("/nursing/procedures", allowed))

    def test_patient_records_grants_patient_detail(self):
        allowed = {"/medical-records/patient-records"}
        self.assertTrue(is_path_allowed_by_pages("/medical-records/patients/abc", allowed))


class ApiAccessTests(SimpleTestCase):
    def test_nursing_api_requires_nursing_page(self):
        allowed = {"/pharmacy"}
        self.assertFalse(check_api_page_access("nursing/procedures/", "GET", allowed))

    def test_nursing_api_allowed_with_nursing_page(self):
        allowed = {"/nursing/procedures"}
        self.assertTrue(check_api_page_access("nursing/procedures/", "GET", allowed))

    def test_patient_detail_allowed_for_clinical_modules(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("patients/42/", "GET", allowed))

    def test_patient_list_denied_for_consultation_only(self):
        allowed = {"/consultation/start"}
        self.assertFalse(check_api_page_access("patients/", "GET", allowed))

    def test_auth_exempt(self):
        self.assertTrue(check_api_page_access("accounts/auth/token/", "POST", set()))

    def test_permissions_roles_read_allowed_for_user_management_page(self):
        allowed = {"/admin/users"}
        self.assertTrue(check_api_page_access("permissions/roles/", "GET", allowed))

    def test_permissions_roles_write_denied_for_user_management_only(self):
        allowed = {"/admin/users"}
        self.assertFalse(check_api_page_access("permissions/roles/", "POST", allowed))

    def test_departments_read_allowed_for_user_management_page(self):
        allowed = {"/admin/users"}
        self.assertTrue(check_api_page_access("departments/", "GET", allowed))
        self.assertTrue(check_api_page_access("organization/departments/", "GET", allowed))

    def test_clinics_read_allowed_for_user_management_page(self):
        allowed = {"/admin/users"}
        self.assertTrue(check_api_page_access("organization/clinics/", "GET", allowed))

    def test_system_roles_read_allowed_for_user_management_page(self):
        allowed = {"/admin/users"}
        self.assertTrue(check_api_page_access("accounts/system-roles/", "GET", allowed))

    def test_normalize_api_path(self):
        self.assertEqual(normalize_api_path("/api/v1/nursing/orders/"), "nursing/orders/")

    def test_patient_create_denied_for_consultation_only(self):
        allowed = {"/consultation/start"}
        self.assertFalse(check_api_page_access("patients/", "POST", allowed))

    def test_patient_create_allowed_with_new_patient_page(self):
        allowed = {"/medical-records/patients/new"}
        self.assertTrue(check_api_page_access("patients/", "POST", allowed))

    def test_patient_update_denied_for_consultation_only(self):
        allowed = {"/consultation/start"}
        self.assertFalse(check_api_page_access("patients/42/", "PATCH", allowed))

    def test_patient_update_allowed_with_patients_page(self):
        allowed = {"/medical-records/patients"}
        self.assertTrue(check_api_page_access("patients/42/", "PATCH", allowed))

    def test_visit_create_allowed_from_consultation_start(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("visits/", "POST", allowed))

    def test_visit_update_allowed_from_nursing(self):
        allowed = {"/nursing"}
        self.assertTrue(check_api_page_access("visits/99/", "PATCH", allowed))

    def test_vitals_write_denied_for_records_read_only(self):
        allowed = {"/medical-records/patient-records"}
        self.assertFalse(check_api_page_access("vitals/", "POST", allowed))

    def test_vitals_write_allowed_for_nursing_vitals(self):
        allowed = {"/nursing/patient-vitals"}
        self.assertTrue(check_api_page_access("vitals/", "POST", allowed))

    def test_admissions_api_allowed_for_ward_pages(self):
        allowed = {"/nursing/wards"}
        self.assertTrue(check_api_page_access("admissions/", "GET", allowed))
        self.assertTrue(check_api_page_access("admissions/123/", "PATCH", allowed))

    def test_admissions_api_denied_without_ward_pages(self):
        allowed = {"/consultation/start"}
        self.assertFalse(check_api_page_access("admissions/", "GET", allowed))
