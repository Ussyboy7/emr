"""Tests for upload validation and media path helpers."""
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings

from common.media_utils import MediaPathError, normalize_media_relative_path
from common.upload_validation import (
    UploadValidationError,
    normalize_upload_folder,
    sanitize_upload_filename,
    validate_upload_file,
)


class UploadValidationTests(SimpleTestCase):
    def test_normalize_upload_folder_rejects_traversal(self):
        with self.assertRaises(UploadValidationError):
            normalize_upload_folder("../etc")

    def test_normalize_upload_folder_accepts_patients(self):
        self.assertEqual(normalize_upload_folder("patients"), "patients")

    def test_sanitize_upload_filename_rejects_exe(self):
        with self.assertRaises(UploadValidationError):
            sanitize_upload_filename("malware.exe")

    def test_sanitize_upload_filename_accepts_pdf(self):
        self.assertEqual(sanitize_upload_filename("report.pdf"), "report.pdf")

    def test_validate_upload_rejects_oversized(self):
        body = b"x" * (11 * 1024 * 1024)
        upload = SimpleUploadedFile("big.pdf", body, content_type="application/pdf")
        with self.assertRaises(UploadValidationError):
            validate_upload_file(upload)

    def test_validate_upload_accepts_small_pdf(self):
        upload = SimpleUploadedFile("report.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        validate_upload_file(upload)


class MediaPathTests(SimpleTestCase):
    def test_normalize_strips_media_prefix(self):
        self.assertEqual(
            normalize_media_relative_path("/media/patients/photos/a.jpg"),
            "patients/photos/a.jpg",
        )

    def test_normalize_rejects_traversal(self):
        with self.assertRaises(MediaPathError):
            normalize_media_relative_path("../secret.pdf")

    @override_settings(MEDIA_ROOT="/tmp/emr-media-test")
    def test_resolve_missing_file_raises(self):
        from common.media_utils import resolve_media_absolute_path

        with self.assertRaises(MediaPathError):
            resolve_media_absolute_path("does/not/exist.pdf")
