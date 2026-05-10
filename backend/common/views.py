"""
Common utility views.
"""
import json
import os
import time
from datetime import datetime, timedelta, timezone as dt_timezone
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from rest_framework import views
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .middleware import read_api_timing_window
from .services import FileUploadService, EmailService, SMSService, BackupService


# Wall-clock seconds at which this Django process first imported this
# module. ``common.urls`` is included from ``emr_backend.urls`` at boot,
# so this value is set during the WSGI/ASGI startup pass and gives us a
# close-enough "API server uptime" reading for the admin dashboard
# without needing an external monitoring stack.
API_PROCESS_STARTED_AT: float = time.time()


def _format_uptime(seconds: float) -> str:
    """Render a duration like ``3d 4h``, ``2h 15m``, ``45s``."""
    seconds = max(0, int(seconds))
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m {secs}s"
    return f"{secs}s"


def _collect_system_health() -> list[dict]:
    """Real availability + uptime for the three components shown on the
    admin dashboard. This intentionally does NOT depend on an external
    APM/monitoring stack — every value is something the API process
    itself can answer:

    * **API Server** — uptime is ``now - common.CommonConfig.api_started_at``
      (recorded in ``apps.ready()``). Health is implicit: if this code
      is executing, the API is up.
    * **Database** — uptime comes from ``pg_postmaster_start_time()``
      when Postgres is configured. Health is determined by ``SELECT 1``.
    * **File Storage** — health is ``MEDIA_ROOT`` writability. We also
      report free space on the volume.
    """
    results: list[dict] = []

    # API Server — module-level timestamp captured at first import
    # (effectively process boot, since common/urls.py is included at
    # startup). Don't rely on apps.get_app_config('common'): the
    # ``common`` package isn't registered in INSTALLED_APPS.
    api_uptime_s = max(0.0, time.time() - API_PROCESS_STARTED_AT)
    results.append({
        'name': 'API Server',
        'status': 'healthy',
        'icon': 'Server',
        'uptime_seconds': int(api_uptime_s),
        'uptime': _format_uptime(api_uptime_s),
        'detail': 'Process uptime since last restart.',
    })

    # Database — Postgres-aware, falls back to a simple ping otherwise.
    db_entry: dict = {'name': 'Database', 'icon': 'Database'}
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        db_entry['status'] = 'healthy'
        vendor = connection.vendor
        if vendor == 'postgresql':
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT EXTRACT(EPOCH FROM (NOW() - pg_postmaster_start_time()))"
                    )
                    row = cursor.fetchone()
                    db_uptime_s = float(row[0]) if row and row[0] is not None else None
            except Exception:
                db_uptime_s = None
            if db_uptime_s is not None:
                db_entry['uptime_seconds'] = int(db_uptime_s)
                db_entry['uptime'] = _format_uptime(db_uptime_s)
                db_entry['detail'] = 'PostgreSQL uptime since postmaster start.'
            else:
                db_entry['uptime_seconds'] = None
                db_entry['uptime'] = None
                db_entry['detail'] = 'Reachable (uptime unavailable).'
        else:
            db_entry['uptime_seconds'] = None
            db_entry['uptime'] = None
            db_entry['detail'] = f'Reachable ({vendor}).'
    except Exception as exc:
        db_entry['status'] = 'error'
        db_entry['uptime_seconds'] = None
        db_entry['uptime'] = None
        db_entry['detail'] = f'Connection failed: {exc}'
    results.append(db_entry)

    # File Storage
    media_path = getattr(settings, 'MEDIA_ROOT', None) or ''
    storage_entry: dict = {'name': 'File Storage', 'icon': 'HardDrive'}
    try:
        if media_path and os.path.exists(media_path) and os.access(media_path, os.W_OK):
            storage_entry['status'] = 'healthy'
            try:
                stat = os.statvfs(media_path)
                free_gb = stat.f_bavail * stat.f_frsize / (1024 ** 3)
                total_gb = stat.f_blocks * stat.f_frsize / (1024 ** 3)
                used_pct = (1 - (free_gb / total_gb)) * 100 if total_gb else 0
                storage_entry['detail'] = (
                    f"{free_gb:.1f} GB free of {total_gb:.1f} GB ({used_pct:.0f}% used)."
                )
                storage_entry['free_gb'] = round(free_gb, 2)
                storage_entry['total_gb'] = round(total_gb, 2)
                # Degrade the badge if the disk is uncomfortably full.
                if used_pct >= 95:
                    storage_entry['status'] = 'error'
                elif used_pct >= 85:
                    storage_entry['status'] = 'warning'
            except (AttributeError, OSError):
                # statvfs not available on Windows / unreadable mount.
                storage_entry['detail'] = 'Writable; free-space stats unavailable.'
        elif media_path and os.path.exists(media_path):
            storage_entry['status'] = 'error'
            storage_entry['detail'] = 'MEDIA_ROOT exists but is not writable by the API process.'
        else:
            storage_entry['status'] = 'warning'
            storage_entry['detail'] = 'MEDIA_ROOT path does not exist.'
    except Exception as exc:
        storage_entry['status'] = 'error'
        storage_entry['detail'] = f'Check failed: {exc}'
    storage_entry['uptime_seconds'] = None
    storage_entry['uptime'] = None
    results.append(storage_entry)

    return results


@require_http_methods(["GET"])
def server_time(request):
    """
    Return the server's current date and time in the configured timezone.

    Used by the frontend to anchor "today" / "this week" / "this month"
    filters off the server's calendar rather than the client's local clock —
    which may be wrong, in a different timezone, or skewed — so that, for
    example, a lab result created "just now" reliably shows up under the
    "Today" tab regardless of the user's device clock.
    """
    now = timezone.localtime()
    return JsonResponse(
        {
            "date": now.date().isoformat(),
            "datetime": now.isoformat(),
            "timezone": settings.TIME_ZONE,
        }
    )


@require_http_methods(["GET"])
def health_live(request):
    """
    Minimal liveness for Docker/K8s: no DB or cache checks.
    Use /api/health/ for full readiness (database + cache).
    """
    return JsonResponse({"status": "ok"})


@require_http_methods(["GET"])
def health_check(request):
    """
    Health check endpoint for monitoring and load balancers.
    
    Returns:
        - 200 OK: All services are healthy
        - 503 Service Unavailable: One or more services are unhealthy
    """
    status = {
        "status": "healthy",
        "services": {},
    }
    overall_healthy = True

    # Check database connectivity
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        status["services"]["database"] = "healthy"
    except Exception as e:
        status["services"]["database"] = f"unhealthy: {str(e)}"
        overall_healthy = False

    # Check cache (Redis) connectivity
    try:
        cache.set("health_check", "ok", 10)
        cache.get("health_check")
        status["services"]["cache"] = "healthy"
    except Exception as e:
        status["services"]["cache"] = f"unhealthy: {str(e)}"
        overall_healthy = False

    # Determine HTTP status code
    http_status = 200 if overall_healthy else 503
    if not overall_healthy:
        status["status"] = "unhealthy"

    return JsonResponse(status, status=http_status)


class SystemMetricsView(views.APIView):
    """System monitoring metrics for dashboard.

    This endpoint only returns numbers that have a real source. Until an
    APM/logging integration is wired, response time and error rate are
    deliberately *omitted* rather than fabricated, so the frontend can't
    pass off hardcoded defaults as live data.

    What is real today:
      * ``mediaStorageGb`` — cumulative size of ``MEDIA_ROOT`` on disk.
        (This is NOT throughput "today"; the old key ``dataProcessedGb``
        was mislabeled.)
      * ``responseTimeMs`` — only set when the cache key
        ``avg_response_time_ms`` is populated by middleware/job. Until
        that exists, the key is absent.
      * ``backupStatus`` — file-system scan of common backup locations.

    Each key returned also has an entry in the ``sources`` map describing
    whether it is ``"live"`` (real measurement) or ``"sample"`` (placeholder).
    """
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Return current system metrics."""
        try:
            metrics: dict = {}
            sources: dict[str, str] = {}

            # Response time + Error rate — derived from the rolling
            # 5-minute window populated by ApiTimingMiddleware. If no
            # API traffic has been observed in that window, both keys
            # are omitted so the UI shows "Not connected" rather than
            # a misleading zero. ``sample`` is exposed so an admin can
            # see how many requests the average was computed from.
            timing = read_api_timing_window()
            if timing:
                metrics['responseTimeMs'] = timing['avg_ms']
                metrics['errorRate'] = timing['error_rate_pct']
                metrics['responseTimeSample'] = timing['sample']
                sources['responseTimeMs'] = 'live'
                sources['errorRate'] = 'live'

            # Media storage — real, measurable, but reflects cumulative
            # MEDIA_ROOT usage. We expose the truthful name and also
            # keep ``dataProcessedGb`` as a deprecated alias so older
            # frontend builds don't break.
            try:
                media_path = settings.MEDIA_ROOT
                if media_path and os.path.exists(media_path):
                    total_size = 0
                    for dirpath, _dirnames, filenames in os.walk(media_path):
                        for filename in filenames:
                            filepath = os.path.join(dirpath, filename)
                            try:
                                total_size += os.path.getsize(filepath)
                            except OSError:
                                continue
                    media_gb = round(total_size / (1024 ** 3), 2)
                else:
                    media_gb = 0.0
                metrics['mediaStorageGb'] = media_gb
                metrics['dataProcessedGb'] = media_gb  # deprecated alias
                sources['mediaStorageGb'] = 'live'
            except Exception:
                pass

            # Backup status — real file-system check.
            backup_status = cache.get('last_backup_status', None)
            if backup_status:
                metrics['backupStatus'] = backup_status
            else:
                metrics['backupStatus'] = self._detect_backup_status()
            sources['backupStatus'] = 'live'

            # System health — process uptime + DB ping + storage check.
            try:
                metrics['systemHealth'] = _collect_system_health()
                sources['systemHealth'] = 'live'
            except Exception:
                # Never let a probe error break the dashboard.
                metrics['systemHealth'] = []

            metrics['sources'] = sources
            return Response(metrics)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    def _detect_backup_status(self):
        """
        Inspect likely backup locations and accept both SQL dumps and the JSON
        backups created by this repository's `backup_data` command.
        """
        repo_root = Path(settings.BASE_DIR).resolve().parent
        candidate_dirs = []

        configured_dir = getattr(settings, 'BACKUP_DIR', None)
        if configured_dir:
            candidate_dirs.append(Path(configured_dir))

        candidate_dirs.extend([
            Path('/backups'),
            repo_root / 'backups',
            Path.cwd() / 'backups',
            Path.home() / 'emr_backups',
            Path.home() / 'emr-predeploy-backups',
        ])

        seen = set()
        unique_dirs = []
        for path in candidate_dirs:
            resolved = str(path.resolve()) if path.exists() else str(path)
            if resolved in seen:
                continue
            seen.add(resolved)
            unique_dirs.append(path)

        backup_suffixes = {'.sql', '.json', '.dump', '.bak', '.gz'}

        for backup_dir in unique_dirs:
            if not backup_dir.exists() or not backup_dir.is_dir():
                continue

            try:
                backup_files = self._find_backup_files(backup_dir, backup_suffixes)
                if not backup_files:
                    continue

                latest_backup = max(backup_files, key=lambda path: path.stat().st_mtime)
                last_backup = datetime.fromtimestamp(
                    latest_backup.stat().st_mtime,
                    tz=dt_timezone.utc,
                )
                hours_ago = (timezone.now() - last_backup).total_seconds() / 3600

                return {
                    'status': 'healthy' if hours_ago < 25 else 'warning',
                    'lastBackup': last_backup.isoformat(),
                    'hoursAgo': round(hours_ago, 1),
                    'filename': latest_backup.name,
                    'directory': str(backup_dir),
                    'message': 'Backup file detected',
                }
            except Exception as exc:
                return {'status': 'error', 'message': str(exc)}

        return {'status': 'unknown', 'message': 'No backup files found'}

    def _find_backup_files(self, backup_dir: Path, backup_suffixes: set[str]):
        """
        Accept both flat file layouts (`/backups/*.json`) and dated snapshot
        directories (`$HOME/emr_backups/20260428/...`).
        """
        candidates = []

        for path in backup_dir.iterdir():
            if path.is_file() and path.suffix.lower() in backup_suffixes:
                candidates.append(path)
                continue

            # Common operational layout: one timestamped directory per run.
            if path.is_dir():
                try:
                    for nested in path.iterdir():
                        if nested.is_file() and nested.suffix.lower() in backup_suffixes:
                            candidates.append(nested)
                except OSError:
                    continue

        return candidates


class LiveDashboardView(views.APIView):
    """Lightweight payload for the admin dashboard's 30 s auto-poll.

    Returning the full ``getDashboardStats()`` aggregate every 30 s is
    overkill — it pulls 1000 users, 1000 roles, 1000 rooms, the audit
    log, etc. just to update an "online now" count and three uptime
    numbers. This endpoint exposes only the data that actually changes
    on each tick:

    * ``onlineNow`` — single ``COUNT`` against ``User`` using the
      same 15-minute window as the frontend calculation.
    * ``systemHealth`` — process uptime, DB ping, MEDIA_ROOT check.
    * ``serverTime`` — useful for a future "last refreshed N s ago"
      label rendered against the server clock.

    The full dashboard fetch still runs on initial load and on a
    user-triggered Refresh so all the other KPIs stay accurate.
    """

    permission_classes = [IsAuthenticated]

    ONLINE_WINDOW = timedelta(minutes=15)

    def get(self, request):
        from accounts.models import User  # local import to avoid a circular boot dep

        cutoff = timezone.now() - self.ONLINE_WINDOW
        online_now = User.objects.filter(is_active=True).filter(
            Q(last_activity__gte=cutoff) | Q(last_login__gte=cutoff)
        ).count()

        try:
            system_health = _collect_system_health()
        except Exception:
            # Never let a probe failure break the live tick — the rest
            # of the dashboard still uses the previous good payload.
            system_health = []

        return Response({
            'onlineNow': online_now,
            'systemHealth': system_health,
            'serverTime': timezone.now().isoformat(),
        })


class FileUploadView(views.APIView):
    """Handle file uploads."""
    
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    
    def post(self, request):
        file = request.FILES.get('file')
        folder = request.data.get('folder', 'uploads')
        
        if not file:
            return Response({'error': 'No file provided'}, status=400)
        
        try:
            file_path = FileUploadService.upload_file(file, folder)
            return Response({'file_path': file_path, 'message': 'File uploaded successfully'})
        except Exception as e:
            return Response({'error': str(e)}, status=500)


class SendEmailView(views.APIView):
    """Send email (admin only)."""
    
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Permission denied'}, status=403)
        
        recipient = request.data.get('recipient')
        subject = request.data.get('subject')
        message = request.data.get('message')
        
        if not all([recipient, subject, message]):
            return Response({'error': 'Missing required fields'}, status=400)
        
        success = EmailService.send_email(recipient, subject, message)
        if success:
            return Response({'message': 'Email sent successfully'})
        return Response({'error': 'Failed to send email'}, status=500)


class ExportDataView(views.APIView):
    """Export data."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        data_type = request.query_params.get('type', 'patients')
        format_type = request.query_params.get('format', 'json')
        
        if data_type == 'patients':
            data = BackupService.export_patients(format_type)
        elif data_type == 'lab_results':
            data = BackupService.export_lab_results(format_type)
        else:
            return Response({'error': 'Invalid data type'}, status=400)
        
        if format_type == 'json':
            return Response(data)
        else:
            # CSV export would be implemented here
            return Response({'message': 'CSV export not yet implemented'})
