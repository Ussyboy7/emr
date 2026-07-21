"""Filesystem discovery for EMR database backup dumps."""
from __future__ import annotations

from datetime import datetime, timezone as dt_timezone
from pathlib import Path

from django.conf import settings
from django.utils import timezone

BACKUP_SUFFIXES = {".sql", ".json", ".dump", ".bak", ".gz"}


def format_bytes(num_bytes: int) -> str:
    """Human-readable size for UI (e.g. 1.24 GB)."""
    size = float(max(0, int(num_bytes)))
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{int(num_bytes)} B"


def backup_candidate_dirs() -> list[Path]:
    repo_root = Path(settings.BASE_DIR).resolve().parent
    candidate_dirs: list[Path] = []

    configured_dir = getattr(settings, "BACKUP_DIR", None)
    if configured_dir:
        candidate_dirs.append(Path(configured_dir))

    candidate_dirs.extend(
        [
            Path("/backups"),
            repo_root / "backups",
            Path.cwd() / "backups",
            Path.home() / "emr_backups",
            Path.home() / "emr-predeploy-backups",
        ]
    )

    seen: set[str] = set()
    unique_dirs: list[Path] = []
    for path in candidate_dirs:
        resolved = str(path.resolve()) if path.exists() else str(path)
        if resolved in seen:
            continue
        seen.add(resolved)
        unique_dirs.append(path)
    return unique_dirs


def find_backup_files(backup_dir: Path) -> list[Path]:
    """Flat files and one-level nested timestamp directories."""
    candidates: list[Path] = []
    try:
        entries = list(backup_dir.iterdir())
    except OSError:
        return candidates

    for path in entries:
        if path.is_file() and path.suffix.lower() in BACKUP_SUFFIXES:
            candidates.append(path)
            continue
        if path.is_dir():
            try:
                for nested in path.iterdir():
                    if nested.is_file() and nested.suffix.lower() in BACKUP_SUFFIXES:
                        candidates.append(nested)
            except OSError:
                continue
    return candidates


def iter_all_backup_files() -> list[Path]:
    files: list[Path] = []
    for backup_dir in backup_candidate_dirs():
        if not backup_dir.exists() or not backup_dir.is_dir():
            continue
        files.extend(find_backup_files(backup_dir))
    return files


def resolve_latest_backup() -> Path | None:
    files = iter_all_backup_files()
    if not files:
        return None
    return max(files, key=lambda path: path.stat().st_mtime)


def resolve_backup_by_filename(filename: str) -> Path | None:
    """Resolve a basename under allowed backup dirs (no path traversal)."""
    name = Path(filename or "").name.strip()
    if not name or name != filename or ".." in name or "/" in name or "\\" in name:
        return None
    if Path(name).suffix.lower() not in BACKUP_SUFFIXES:
        return None

    for path in iter_all_backup_files():
        if path.name == name:
            resolved = path.resolve()
            # Must stay inside one of the candidate roots.
            for root in backup_candidate_dirs():
                try:
                    if root.exists() and resolved.is_relative_to(root.resolve()):
                        return resolved
                except (OSError, ValueError):
                    continue
    return None


def detect_backup_status() -> dict:
    """
    Status payload for System Health / metrics.

    Includes sizeBytes + sizeDisplay for the latest dump when found.
    """
    try:
        latest = resolve_latest_backup()
    except Exception as exc:
        return {"status": "error", "message": str(exc)}

    if latest is None:
        return {"status": "unknown", "message": "No backup files found"}

    try:
        st = latest.stat()
        last_backup = datetime.fromtimestamp(st.st_mtime, tz=dt_timezone.utc)
        hours_ago = (timezone.now() - last_backup).total_seconds() / 3600
        return {
            "status": "healthy" if hours_ago < 25 else "warning",
            "lastBackup": last_backup.isoformat(),
            "hoursAgo": round(hours_ago, 1),
            "filename": latest.name,
            "directory": str(latest.parent),
            "sizeBytes": st.st_size,
            "sizeDisplay": format_bytes(st.st_size),
            "message": "Backup file detected",
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
