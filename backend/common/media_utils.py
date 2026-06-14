"""
Safe resolution of paths under MEDIA_ROOT.
"""
from __future__ import annotations

import mimetypes
import os

from django.conf import settings


class MediaPathError(ValueError):
    """Invalid or unsafe media path."""


def normalize_media_relative_path(relative_path: str) -> str:
    """Strip optional /media/ prefix and normalize slashes."""
    rel = (relative_path or "").strip().replace("\\", "/").lstrip("/")
    if rel.startswith("media/"):
        rel = rel[len("media/") :]
    if not rel or rel.endswith("/"):
        raise MediaPathError("Invalid media path.")
    parts = rel.split("/")
    if ".." in parts or "." in parts:
        raise MediaPathError("Invalid media path.")
    return rel


def resolve_media_absolute_path(relative_path: str) -> str:
    """Return absolute filesystem path under MEDIA_ROOT."""
    rel = normalize_media_relative_path(relative_path)
    media_root = os.path.normpath(str(settings.MEDIA_ROOT))
    abs_path = os.path.normpath(os.path.join(media_root, rel))
    if abs_path != media_root and not abs_path.startswith(media_root + os.sep):
        raise MediaPathError("Path traversal blocked.")
    if not os.path.isfile(abs_path):
        raise MediaPathError("File not found.")
    return abs_path


def guess_media_content_type(abs_path: str) -> str:
    content_type, _ = mimetypes.guess_type(abs_path)
    return content_type or "application/octet-stream"
