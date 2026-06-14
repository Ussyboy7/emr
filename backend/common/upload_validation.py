"""
Validation rules for user file uploads (clinical attachments, photos, PDFs).
"""
from __future__ import annotations

import os
from typing import BinaryIO

from django.core.files.uploadedfile import UploadedFile

# 10 MB — aligned with nginx client_max_body_size for API routes.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

ALLOWED_UPLOAD_FOLDERS = frozenset(
    {
        "uploads",
        "patients",
        "lab_results",
        "referrals",
        "avatars",
        "radiology",
        "laboratory",
        "wards",
        "consultation",
    }
)

ALLOWED_EXTENSIONS = frozenset({".pdf", ".jpg", ".jpeg", ".png", ".webp"})

ALLOWED_CONTENT_TYPES = frozenset(
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
    }
)

# Reject executable / script-like extensions even if MIME is spoofed.
BLOCKED_EXTENSIONS = frozenset(
    {
        ".exe",
        ".bat",
        ".cmd",
        ".com",
        ".msi",
        ".sh",
        ".bash",
        ".js",
        ".html",
        ".htm",
        ".svg",
        ".php",
        ".py",
        ".jar",
        ".dll",
        ".vbs",
        ".ps1",
    }
)


class UploadValidationError(ValueError):
    """Raised when an upload fails policy checks."""


def normalize_upload_folder(folder: str | None) -> str:
    raw = (folder or "uploads").strip().strip("/").replace("\\", "/")
    if not raw or ".." in raw.split("/"):
        raise UploadValidationError("Invalid upload folder.")
    if raw not in ALLOWED_UPLOAD_FOLDERS:
        raise UploadValidationError(
            f"Upload folder not allowed. Use one of: {', '.join(sorted(ALLOWED_UPLOAD_FOLDERS))}."
        )
    return raw


def sanitize_upload_filename(name: str | None) -> str:
    from django.utils.text import get_valid_filename

    base = get_valid_filename(os.path.basename(name or "upload"))
    if not base or base in {".", ".."}:
        raise UploadValidationError("Invalid file name.")
    lower = base.lower()
    for blocked in BLOCKED_EXTENSIONS:
        if lower.endswith(blocked) or blocked.strip(".") in lower.split("."):
            raise UploadValidationError("File type not allowed.")
    ext = os.path.splitext(lower)[1]
    if ext not in ALLOWED_EXTENSIONS:
        raise UploadValidationError(
            "File type not allowed. Upload PDF or image files (JPG, PNG, WebP) only."
        )
    return base


def validate_upload_file(file: UploadedFile) -> None:
    if file.size is None or file.size <= 0:
        raise UploadValidationError("Empty file.")
    if file.size > MAX_UPLOAD_BYTES:
        raise UploadValidationError(
            f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )

    sanitize_upload_filename(file.name)

    content_type = (getattr(file, "content_type", None) or "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise UploadValidationError(
            "File type not allowed. Upload PDF or image files (JPG, PNG, WebP) only."
        )

    _validate_file_magic(file)


def _validate_file_magic(file: UploadedFile) -> None:
    """Best-effort content sniffing beyond client-supplied Content-Type."""
    pos = file.tell() if hasattr(file, "tell") else None
    try:
        head = _read_head(file, 16)
    finally:
        if pos is not None and hasattr(file, "seek"):
            file.seek(pos)

    lower_name = (file.name or "").lower()
    if lower_name.endswith(".pdf"):
        if not head.startswith(b"%PDF"):
            raise UploadValidationError("File does not appear to be a valid PDF.")
        return

    if lower_name.endswith((".jpg", ".jpeg", ".png", ".webp")):
        try:
            from PIL import Image

            if pos is not None and hasattr(file, "seek"):
                file.seek(pos)
            with Image.open(file) as img:
                img.verify()
            if pos is not None and hasattr(file, "seek"):
                file.seek(pos)
        except Exception as exc:
            raise UploadValidationError("File does not appear to be a valid image.") from exc


def _read_head(file: BinaryIO, n: int) -> bytes:
    if hasattr(file, "seek"):
        file.seek(0)
    data = file.read(n)
    if hasattr(file, "seek"):
        file.seek(0)
    return data or b""
