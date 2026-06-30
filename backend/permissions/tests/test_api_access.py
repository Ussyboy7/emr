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

    def test_consultation_start_grants_room_workspace(self):
        allowed = {"/consultation/start"}
        self.assertTrue(is_path_allowed_by_pages("/consultation/room/12", allowed))

    def test_consultation_room_denied_without_consultation_access(self):
        allowed = {"/nursing"}
        self.assertFalse(is_path_allowed_by_pages("/consultation/room/12", allowed))

    def test_deny_overrides_parent_prefix(self):
        allowed = {"/nursing", "/nursing/procedures"}
        denied = {"/nursing/pool-queue"}
        self.assertFalse(is_path_allowed_by_pages("/nursing/pool-queue", allowed, denied))
        self.assertTrue(is_path_allowed_by_pages("/nursing/procedures", allowed, denied))

    def test_deny_parent_blocks_children(self):
        allowed = {"/nursing", "/nursing/pool-queue", "/nursing/procedures"}
        denied = {"/nursing"}
        self.assertFalse(is_path_allowed_by_pages("/nursing/procedures", allowed, denied))

    def test_user_management_does_not_unlock_admin_dashboard(self):
        allowed = {"/admin/users"}
        self.assertFalse(is_path_allowed_by_pages("/admin", allowed))
        self.assertFalse(is_path_allowed_by_pages("/admin/clinics", allowed))
        self.assertTrue(is_path_allowed_by_pages("/admin/users", allowed))

    def test_admin_child_still_unlocks_admin_dashboard(self):
        allowed = {"/admin/clinics"}
        self.assertTrue(is_path_allowed_by_pages("/admin", allowed))

    def test_consultation_referrals_grants_consultation_api_pages(self):
        from permissions.page_paths import user_has_consultation_access

        allowed = {"/consultation/referrals"}
        self.assertTrue(user_has_consultation_access(allowed))


class ApiAccessTests(SimpleTestCase):
    def test_nursing_api_requires_nursing_page(self):
        allowed = {"/pharmacy"}
        self.assertFalse(check_api_page_access("nursing/procedures/", "GET", allowed))

    def test_nursing_api_allowed_with_nursing_page(self):
        allowed = {"/nursing/procedures"}
        self.assertTrue(check_api_page_access("nursing/procedures/", "GET", allowed))

    def test_consultation_api_allowed_for_admin_rooms_page(self):
        allowed = {"/admin/rooms"}
        self.assertTrue(check_api_page_access("consultation/rooms/", "GET", allowed))
        self.assertTrue(check_api_page_access("consultation/rooms/", "POST", allowed))

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

    def test_consultation_api_denied_when_pool_queue_restricted_per_user(self):
        allowed = {"/nursing", "/nursing/procedures"}
        denied = {"/nursing/pool-queue"}
        self.assertFalse(check_api_page_access("consultation/queue/", "GET", allowed, denied))
        self.assertTrue(check_api_page_access("nursing/procedures/", "GET", allowed, denied))

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

    def test_nursing_order_create_allowed_for_consultation_room_page(self):
        allowed = {"/consultation/room"}
        self.assertTrue(check_api_page_access("nursing/orders/", "POST", allowed))

    def test_patient_update_history_allowed_for_consultation_start(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("patients/42/update_history/", "PATCH", allowed))

    def test_admissions_discharge_allowed_for_consultation_start(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("admissions/9/discharge/", "POST", allowed))

    def test_annual_checkups_allowed_for_consultation_start(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("annual-checkups/1/", "GET", allowed))

    def test_clinical_overview_allowed_for_consultation_referrals_only(self):
        allowed = {"/consultation/referrals"}
        self.assertTrue(check_api_page_access("patients/42/clinical-overview/", "GET", allowed))

    def test_lab_results_read_allowed_for_consultation_start(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("laboratory/tests/42/", "GET", allowed))
        self.assertTrue(check_api_page_access("laboratory/verification/9/", "GET", allowed))
        self.assertTrue(check_api_page_access("laboratory/verification/9/download_report/", "GET", allowed))

    def test_radiology_reports_read_allowed_for_consultation_start(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("radiology/verification/3/", "GET", allowed))
        self.assertTrue(check_api_page_access("radiology/studies/5/", "GET", allowed))

    def test_lab_verification_write_denied_for_consultation_only(self):
        allowed = {"/consultation/start"}
        self.assertFalse(check_api_page_access("laboratory/verification/9/", "PATCH", allowed))

    def test_nursing_order_patch_allowed_for_consultation_wards(self):
        allowed = {"/consultation/wards"}
        self.assertTrue(check_api_page_access("nursing/orders/42/", "PATCH", allowed))

    def test_nursing_order_patch_allowed_for_consultation_start(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("nursing/orders/42/", "PATCH", allowed))

    def test_nursing_order_patch_denied_without_nursing_or_consultation(self):
        allowed = {"/laboratory"}
        self.assertFalse(check_api_page_access("nursing/orders/42/", "PATCH", allowed))

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

    def test_ward_care_sub_apis_allowed_for_nursing_wards_page(self):
        allowed = {"/nursing/wards"}
        paths = (
            "beds/",
            "beds/12/",
            "beds/12/assign_patient/",
            "assignments/",
            "assignments/active-for-admissions/",
            "assignments/3/complete/",
            "observation-vitals/",
            "observation-vitals/9/",
            "treatment-sheet-rows/",
            "treatment-sheet-rows/4/",
            "admission-escorts/",
            "admission-escorts/7/confirm_arrival/",
        )
        for path in paths:
            with self.subTest(path=path):
                self.assertTrue(check_api_page_access(path, "GET", allowed))
                self.assertTrue(check_api_page_access(path, "POST", allowed))

    def test_ward_care_sub_apis_allowed_for_consultation_wards_page(self):
        allowed = {"/consultation/wards"}
        self.assertTrue(check_api_page_access("observation-vitals/", "GET", allowed))
        self.assertTrue(check_api_page_access("assignments/", "POST", allowed))

    def test_ward_care_sub_apis_read_allowed_for_consultation_start(self):
        allowed = {"/consultation/start"}
        self.assertTrue(check_api_page_access("beds/", "GET", allowed))
        self.assertTrue(check_api_page_access("assignments/active-for-admissions/", "GET", allowed))
        self.assertFalse(check_api_page_access("beds/", "POST", allowed))

    def test_ward_care_sub_apis_denied_without_ward_pages(self):
        allowed = {"/laboratory"}
        self.assertFalse(check_api_page_access("observation-vitals/", "GET", allowed))
        self.assertFalse(check_api_page_access("assignments/", "POST", allowed))

    def test_security_settings_get_allowed_for_any_authenticated_pages(self):
        allowed = {"/nursing"}
        self.assertTrue(check_api_page_access("organization/security-settings/", "GET", allowed))

    def test_security_settings_patch_requires_admin_settings(self):
        allowed = {"/nursing"}
        self.assertFalse(check_api_page_access("organization/security-settings/", "PATCH", allowed))
        self.assertTrue(check_api_page_access("organization/security-settings/", "PATCH", {"/admin/settings"}))

    def test_hr_compliance_api_allowed_for_hr_dashboard_page(self):
        allowed = {"/hr"}
        self.assertTrue(check_api_page_access("hr/compliance/", "GET", allowed))

    def test_hr_compliance_api_allowed_for_annual_checkups_page(self):
        allowed = {"/hr/annual-checkups"}
        self.assertTrue(check_api_page_access("hr/compliance/", "GET", allowed))

    def test_hr_compliance_api_denied_without_hr_pages(self):
        allowed = {"/nursing"}
        self.assertFalse(check_api_page_access("hr/compliance/", "GET", allowed))

    def test_hr_exemptions_api_requires_exemptions_page(self):
        allowed = {"/hr", "/hr/annual-checkups"}
        self.assertFalse(check_api_page_access("hr/exemptions/", "GET", allowed))
        self.assertFalse(check_api_page_access("hr/exemptions/", "POST", allowed))

    def test_hr_exemptions_api_allowed_with_exemptions_page(self):
        allowed = {"/hr/exemptions"}
        self.assertTrue(check_api_page_access("hr/exemptions/", "GET", allowed))
        self.assertTrue(check_api_page_access("hr/exemptions/", "POST", allowed))
        self.assertTrue(check_api_page_access("hr/exemptions/3/", "DELETE", allowed))

    def test_support_tickets_api_allowed_for_authenticated_module_access(self):
        allowed = {"/nursing"}
        self.assertTrue(check_api_page_access("support/tickets/", "POST", allowed))

    def test_support_tickets_api_denied_without_any_pages(self):
        allowed = set()
        self.assertFalse(check_api_page_access("support/tickets/", "POST", allowed))

    def test_support_ticket_queue_requires_admin_page(self):
        allowed = {"/nursing"}
        self.assertFalse(check_api_page_access("support/tickets/queue/", "GET", allowed))
        allowed_it = {"/admin/support-tickets"}
        self.assertTrue(check_api_page_access("support/tickets/queue/", "GET", allowed_it))

    def test_support_ticket_patch_requires_admin_page(self):
        allowed = {"/admin/audit"}
        self.assertTrue(check_api_page_access("support/tickets/42/", "PATCH", allowed))

    def test_support_docs_allowed_for_authenticated_users(self):
        allowed = {"/nursing"}
        self.assertTrue(check_api_page_access("support/docs/", "GET", allowed))
        self.assertTrue(check_api_page_access("support/docs/quick-start/", "GET", allowed))
