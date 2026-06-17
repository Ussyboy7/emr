from django.test import SimpleTestCase

from permissions.page_paths import normalize_role_page_path
from permissions.role_permissions import normalize_role_permissions_list


class RolePermissionsNormalizationTests(SimpleTestCase):
    def test_normalizes_legacy_dependents_path(self):
        self.assertEqual(
            normalize_role_page_path("/medical-records/dependents"),
            "/medical-records/patients",
        )

    def test_normalize_permissions_deduplicates_and_aliases(self):
        raw = {
            "pages": [
                "/medical-records/dependents",
                "/medical-records/patients",
                "/nursing/patient-vitals",
                "/nursing/vitals-history",
            ]
        }
        self.assertEqual(
            normalize_role_permissions_list(raw),
            ["/medical-records/patients", "/nursing/vitals-history"],
        )
