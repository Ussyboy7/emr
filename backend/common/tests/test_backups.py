"""Tests for backup discovery and download."""
import tempfile
from pathlib import Path

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from common.backups import detect_backup_status, format_bytes
from common.tests.support import create_test_user


class FormatBytesTests(TestCase):
    def test_format_bytes(self):
        self.assertEqual(format_bytes(500), "500 B")
        self.assertEqual(format_bytes(2048), "2.00 KB")
        self.assertEqual(format_bytes(1024**3), "1.00 GB")


class BackupDiscoveryTests(TestCase):
    def test_detect_includes_size(self):
        with tempfile.TemporaryDirectory() as tmp:
            backup_dir = Path(tmp) / "backups"
            backup_dir.mkdir()
            dump = backup_dir / "emr_test.dump"
            dump.write_bytes(b"x" * 2048)

            with override_settings(BACKUP_DIR=str(backup_dir)):
                status_payload = detect_backup_status()

            self.assertEqual(status_payload["status"], "healthy")
            self.assertEqual(status_payload["filename"], "emr_test.dump")
            self.assertEqual(status_payload["sizeBytes"], 2048)
            self.assertEqual(status_payload["sizeDisplay"], "2.00 KB")


class BackupDownloadApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = create_test_user("backup_admin", superuser=True)
        cls.nurse = create_test_user(
            "backup_nurse",
            pages=["/admin/health"],
            system_role="Nurse",
        )

    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.backup_dir = Path(self._tmpdir.name) / "backups"
        self.backup_dir.mkdir()
        self.dump = self.backup_dir / "emrprod_test.dump"
        self.dump.write_bytes(b"backup-bytes")
        cache.delete("last_backup_status")

    def tearDown(self):
        self._tmpdir.cleanup()
        cache.delete("last_backup_status")

    def test_superuser_can_download_latest(self):
        self.client.force_authenticate(user=self.admin)
        with override_settings(BACKUP_DIR=str(self.backup_dir)):
            res = self.client.get("/api/v1/common/backups/latest/download/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(res.streaming_content), b"backup-bytes")
        self.assertIn("emrprod_test.dump", res.get("Content-Disposition", ""))

    def test_non_superuser_forbidden(self):
        self.client.force_authenticate(user=self.nurse)
        with override_settings(BACKUP_DIR=str(self.backup_dir)):
            res = self.client.get("/api/v1/common/backups/latest/download/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_metrics_include_size(self):
        self.client.force_authenticate(user=self.admin)
        with override_settings(BACKUP_DIR=str(self.backup_dir)):
            res = self.client.get("/api/v1/common/metrics/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        backup = res.data.get("backupStatus") or {}
        self.assertEqual(backup.get("filename"), "emrprod_test.dump")
        self.assertEqual(backup.get("sizeBytes"), len(b"backup-bytes"))
        self.assertIn("sizeDisplay", backup)
