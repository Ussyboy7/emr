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

    def test_consultation_api_allowed_for_nursing_room_queue_page(self):
        allowed = {"/nursing/room-queue"}
        self.assertTrue(check_api_page_access("consultation/rooms/", "GET", allowed))
        self.assertTrue(check_api_page_access("consultation/sessions/", "GET", allowed))
        self.assertTrue(check_api_page_access("consultation/queue/", "GET", allowed))

    def test_consultation_api_allowed_for_nursing_pool_queue_page(self):
        allowed = {"/nursing/pool-queue"}
        self.assertTrue(check_api_page_access("consultation/rooms/", "GET", allowed))
        self.assertTrue(check_api_page_access("consultation/sessions/", "GET", allowed))
        self.assertTrue(check_api_page_access("consultation/queue/", "GET", allowed))

    def test_physio_checkin_api_allowed_for_nursing_pool_queue_page(self):
        allowed = {"/nursing/pool-queue"}
        self.assertTrue(check_api_page_access("orders/checkins-for-visits/", "GET", allowed))
        self.assertTrue(check_api_page_access("orders/checkin-from-visit/", "POST", allowed))

    def test_eyecare_checkin_api_allowed_for_nursing_pool_queue_page(self):
        allowed = {"/nursing/pool-queue"}
        self.assertTrue(check_api_page_access("eyecare/orders/checkins-for-visits/", "GET", allowed))
        self.assertTrue(check_api_page_access("eyecare/orders/checkin-from-visit/", "POST", allowed))

    def test_patient_detail_allowed_for_clinical_modules(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("patients/42/", "GET", allowed))

    def test_patient_list_allowed_for_consultation_only(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("patients/", "GET", allowed))

    def test_patient_list_allowed_for_laboratory_orders(self):
        allowed = {"/laboratory/orders"}
        self.assertTrue(check_api_page_access("patients/", "GET", allowed))

    def test_lab_order_create_allowed_for_consultation_pages(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("laboratory/orders/", "POST", allowed))

    def test_radiology_order_create_allowed_for_consultation_pages(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("radiology/orders/", "POST", allowed))

    def test_pharmacy_prescription_create_allowed_for_consultation_pages(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("v1/pharmacy/prescriptions/", "POST", allowed))

    def test_nursing_order_create_allowed_for_consultation_pages(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("nursing/orders/", "POST", allowed))

    def test_nursing_order_create_denied_without_nursing_or_consultation(self):
        allowed = {"/laboratory"}
        self.assertFalse(check_api_page_access("nursing/orders/", "POST", allowed))

    def test_wards_read_allowed_for_consultation_start(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("wards/", "GET", allowed))

    def test_admissions_read_allowed_for_consultation_start(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("admissions/", "GET", allowed))

    def test_physio_order_create_allowed_for_consultation_pages(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("orders/", "POST", allowed))

    def test_eyecare_order_create_allowed_for_consultation_pages(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("eyecare/orders/", "POST", allowed))

    def test_laboratory_orders_read_allowed_for_physiotherapy(self):
        allowed = {"/physiotherapy/orders"}
        self.assertTrue(check_api_page_access("laboratory/orders/", "GET", allowed))
        self.assertFalse(check_api_page_access("laboratory/orders/", "POST", allowed))

    def test_laboratory_completed_page_allows_lab_module_api(self):
        allowed = {"/laboratory/completed"}
        self.assertTrue(check_api_page_access("laboratory/tests/", "GET", allowed))

    def test_radiology_completed_page_allows_radiology_module_api(self):
        allowed = {"/radiology/completed"}
        self.assertTrue(check_api_page_access("radiology/orders/", "GET", allowed))

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

    def test_lab_templates_read_allowed_for_consultation_pages(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("laboratory/templates/", "GET", allowed))

    def test_normalize_api_path(self):
        self.assertEqual(normalize_api_path("/api/v1/nursing/orders/"), "nursing/orders/")
        self.assertEqual(normalize_api_path("v1/pharmacy/prescriptions/"), "pharmacy/prescriptions/")

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

    def test_visit_list_allowed_for_nursing_pool_queue(self):
        allowed = {"/nursing/pool-queue"}
        self.assertTrue(check_api_page_access("visits/", "GET", allowed))

    def test_visit_update_allowed_from_nursing(self):
        allowed = {"/nursing"}
        self.assertTrue(check_api_page_access("visits/99/", "PATCH", allowed))

    def test_vitals_write_denied_for_records_read_only(self):
        allowed = {"/medical-records/patient-records"}
        self.assertFalse(check_api_page_access("vitals/", "POST", allowed))

    def test_vitals_write_allowed_for_nursing_vitals(self):
        allowed = {"/nursing/patient-vitals"}
        self.assertTrue(check_api_page_access("vitals/", "POST", allowed))

    def test_vitals_read_and_write_allowed_for_nursing_pool_queue(self):
        allowed = {"/nursing/pool-queue"}
        self.assertTrue(check_api_page_access("vitals/latest-by-visits/", "GET", allowed))
        self.assertTrue(check_api_page_access("vitals/", "POST", allowed))

    def test_physio_root_orders_allowed_for_physio_orders_page(self):
        allowed = {"/physiotherapy/orders"}
        self.assertTrue(check_api_page_access("orders/", "GET", allowed))
        self.assertTrue(check_api_page_access("orders/123/", "PATCH", allowed))

    def test_physio_root_sessions_allowed_for_physio_orders_page(self):
        allowed = {"/physiotherapy/orders"}
        self.assertTrue(check_api_page_access("sessions/", "GET", allowed))
        self.assertTrue(check_api_page_access("sessions/99/start_session/", "POST", allowed))

    def test_admissions_api_allowed_for_ward_pages(self):
        allowed = {"/nursing/wards"}
        self.assertTrue(check_api_page_access("admissions/", "GET", allowed))
        self.assertTrue(check_api_page_access("admissions/123/", "PATCH", allowed))

    def test_admissions_api_denied_without_ward_pages(self):
        allowed = {"/laboratory"}
        self.assertFalse(check_api_page_access("admissions/", "GET", allowed))
