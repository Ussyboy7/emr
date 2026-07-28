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
from django.http import FileResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from drf_spectacular.utils import OpenApiResponse
from rest_framework import views
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.authentication import JWTCookieAuthentication, JWTAuthenticationWithActivity

from .media_utils import MediaPathError, guess_media_content_type, resolve_media_absolute_path
from .middleware import read_api_timing_window
from .services import FileUploadService, EmailService, SMSService, BackupService
from .upload_validation import UploadValidationError
from common.openapi import (
    HEALTH_CHECK_RESPONSE,
    JSON_MUTATION_RESPONSES,
    JSON_OBJECT_RESPONSE,
    SERVER_TIME_RESPONSE,
    document_api_view,
)


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
        'started_at': datetime.fromtimestamp(
            API_PROCESS_STARTED_AT, tz=dt_timezone.utc
        ).isoformat(),
    })

    # Database — Postgres-aware, falls back to a simple ping otherwise.
    db_entry: dict = {'name': 'Database', 'icon': 'Database'}
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        db_entry['status'] = 'healthy'
        vendor = connection.vendor
        db_entry['engine'] = vendor
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
    media_path_str = str(media_path) if media_path else ''
    storage_entry: dict = {'name': 'File Storage', 'icon': 'HardDrive'}
    try:
        if media_path_str and os.path.exists(media_path_str) and os.access(media_path_str, os.W_OK):
            storage_entry['status'] = 'healthy'
            try:
                stat = os.statvfs(media_path_str)
                free_gb = stat.f_bavail * stat.f_frsize / (1024 ** 3)
                total_gb = stat.f_blocks * stat.f_frsize / (1024 ** 3)
                used_pct = (1 - (free_gb / total_gb)) * 100 if total_gb else 0
                storage_entry['detail'] = (
                    f"{free_gb:.1f} GB free of {total_gb:.1f} GB ({used_pct:.0f}% used)."
                )
                storage_entry['free_gb'] = round(free_gb, 2)
                storage_entry['total_gb'] = round(total_gb, 2)
                storage_entry['used_gb'] = round(total_gb - free_gb, 2)
                storage_entry['used_pct'] = round(used_pct, 1)
                storage_entry['path'] = media_path_str
                # Degrade the badge if the disk is uncomfortably full.
                if used_pct >= 95:
                    storage_entry['status'] = 'error'
                elif used_pct >= 85:
                    storage_entry['status'] = 'warning'
            except (AttributeError, OSError):
                # statvfs not available on Windows / unreadable mount.
                storage_entry['detail'] = 'Writable; free-space stats unavailable.'
        elif media_path_str and os.path.exists(media_path_str):
            storage_entry['status'] = 'error'
            storage_entry['detail'] = 'MEDIA_ROOT exists but is not writable by the API process.'
            storage_entry['path'] = media_path_str
        else:
            storage_entry['status'] = 'warning'
            storage_entry['detail'] = 'MEDIA_ROOT path does not exist.'
            storage_entry['path'] = media_path_str or None
    except Exception as exc:
        storage_entry['status'] = 'error'
        storage_entry['detail'] = f'Check failed: {exc}'
    storage_entry['uptime_seconds'] = None
    storage_entry['uptime'] = None
    results.append(storage_entry)

    return results


def _build_server_time_payload() -> dict:
    now = timezone.localtime()
    return {
        "date": now.date().isoformat(),
        "datetime": now.isoformat(),
        "timezone": settings.TIME_ZONE,
    }


def _build_health_payload() -> tuple[dict, int]:
    status = {
        "status": "healthy",
        "services": {},
    }
    overall_healthy = True

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        status["services"]["database"] = "healthy"
    except Exception as e:
        status["services"]["database"] = f"unhealthy: {str(e)}"
        overall_healthy = False

    try:
        cache.set("health_check", "ok", 10)
        cache.get("health_check")
        status["services"]["cache"] = "healthy"
    except Exception as e:
        status["services"]["cache"] = f"unhealthy: {str(e)}"
        overall_healthy = False

    http_status = 200 if overall_healthy else 503
    if not overall_healthy:
        status["status"] = "unhealthy"
    return status, http_status


@document_api_view(tag="Common", summary="Server date and time", responses=SERVER_TIME_RESPONSE)
class ServerTimeView(views.APIView):
    """Return the server's current date and time in the configured timezone."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(_build_server_time_payload())


@document_api_view(
    tag="Common",
    summary="Liveness probe",
    responses={200: OpenApiResponse(response={"type": "object", "properties": {"status": {"type": "string"}}})},
)
class HealthLiveView(views.APIView):
    """Minimal liveness for Docker/K8s: no DB or cache checks."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


@document_api_view(tag="Common", summary="Full health check (database and cache)", responses=HEALTH_CHECK_RESPONSE)
class HealthCheckView(views.APIView):
    """Health check endpoint for monitoring and load balancers."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        payload, http_status = _build_health_payload()
        return Response(payload, status=http_status)


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
    return JsonResponse(_build_server_time_payload())


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
    payload, http_status = _build_health_payload()
    return JsonResponse(payload, status=http_status)


@document_api_view(tag="Common", summary="System metrics for admin dashboard")
class SystemMetricsView(views.APIView):
    """System monitoring metrics for dashboard.

    This endpoint only returns numbers that have a real source. Until an
    APM/logging integration is wired, response time and error rate are
    deliberately *omitted* rather than fabricated, so the frontend can't
    pass off hardcoded defaults as live data.

    What is real today:
      * ``mediaStorageGb`` — cumulative size of ``MEDIA_ROOT`` on disk.
      * ``responseTimeMs`` — only set when the cache key
        ``avg_response_time_ms`` is populated by middleware/job. Until
        that exists, the key is absent.
      * ``backupStatus`` — file-system scan of common backup locations.

    Each key returned also has an entry in the ``sources`` map describing
    whether it is ``"live"`` (real measurement) or ``"sample"`` (placeholder).
    """
    
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

            # Media storage — cumulative MEDIA_ROOT usage on disk.
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
                sources['mediaStorageGb'] = 'live'
            except Exception:
                pass

            # Backup status — real file-system check.
            backup_status = cache.get('last_backup_status', None)
            normalized_backup_status = self._normalize_cached_backup_status(backup_status)
            if normalized_backup_status and 'sizeBytes' in normalized_backup_status:
                metrics['backupStatus'] = normalized_backup_status
            else:
                from .backups import detect_backup_status

                detected = detect_backup_status()
                metrics['backupStatus'] = detected
                # Keep a short-lived cached snapshot so repeated dashboard
                # polls do not hammer disk scans when no sidecar cache exists.
                cache.set('last_backup_status', detected, timeout=15 * 60)
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

    def _normalize_cached_backup_status(self, cached_status):
        """
        Accept backup status from either:
        - Django cache objects (dict), or
        - JSON strings published directly into Redis by the backup sidecar.
        """
        if not cached_status:
            return None

        if isinstance(cached_status, dict):
            return cached_status

        if isinstance(cached_status, (bytes, bytearray)):
            try:
                cached_status = cached_status.decode('utf-8')
            except Exception:
                return None

        if isinstance(cached_status, str):
            try:
                parsed = json.loads(cached_status)
            except json.JSONDecodeError:
                return None
            if isinstance(parsed, dict):
                return parsed

        return None


@document_api_view(tag="Common", summary="Download latest EMR backup dump")
class BackupLatestDownloadView(views.APIView):
    """
    Stream the newest backup file under allowed backup directories.

    Superuser only — dumps contain full production data.
    """

    authentication_classes = [JWTAuthenticationWithActivity, JWTCookieAuthentication]
    permission_classes = [IsAuthenticated]
    page_access_exempt = True

    def get(self, request):
        if not getattr(request.user, 'is_superuser', False):
            return Response(
                {'detail': 'Only system administrators can download backups.'},
                status=403,
            )

        from .backups import resolve_latest_backup

        path = resolve_latest_backup()
        if path is None or not path.is_file():
            return Response({'detail': 'No backup file found.'}, status=404)

        try:
            from audit.services import AuditService

            AuditService.log_activity(
                user=request.user,
                action='download',
                object_type='backup',
                object_id=path.name,
                module='administration',
                object_repr=path.name,
                description=f'Downloaded backup file {path.name}',
                request=request,
            )
        except Exception:
            pass

        response = FileResponse(
            open(path, 'rb'),
            as_attachment=True,
            filename=path.name,
        )
        response['Content-Type'] = 'application/octet-stream'
        return response


@document_api_view(tag="Dashboard", summary="Operational dashboard aggregates")
class OperationalDashboardView(views.APIView):
    """Single-request aggregates for the global EMR home dashboard."""

    def get(self, request):
        from .operational_dashboard import _parse_api_date, build_operational_dashboard

        target = _parse_api_date(request.query_params.get("date"))
        return Response(build_operational_dashboard(target))


@document_api_view(tag="Dashboard", summary="Admin dashboard statistics")
class AdminDashboardStatsView(views.APIView):
    """Server-side admin dashboard stats (replaces client fan-out)."""

    def get(self, request):
        from permissions.page_paths import user_has_any_page
        from permissions.user_pages import ADMIN_ROLE_PAGES, SUPERUSER_PAGES, get_user_allowed_pages

        allowed = get_user_allowed_pages(request.user)
        if not (
            request.user.is_superuser
            or allowed & (SUPERUSER_PAGES | ADMIN_ROLE_PAGES)
            or user_has_any_page(allowed, ("/admin",))
        ):
            return Response({"error": "Permission denied"}, status=403)

        from .admin_dashboard_stats import build_admin_dashboard_stats

        metrics: dict = {}
        try:
            metrics_resp = SystemMetricsView().get(request)
            if hasattr(metrics_resp, "data") and isinstance(metrics_resp.data, dict):
                metrics = metrics_resp.data
        except Exception:
            pass
        return Response(build_admin_dashboard_stats(metrics))


@document_api_view(tag="Dashboard", summary="Live admin dashboard poll payload")
class LiveDashboardView(views.APIView):
    """Lightweight payload for the admin dashboard's 30 s auto-poll.

    * ``onlineNow`` — active users with recent ``last_activity`` (see
      ``accounts.presence``; login alone does not count).
    * ``systemHealth`` — process uptime, DB ping, MEDIA_ROOT check.
    * ``serverTime`` — server clock for refresh labels.
  """

    def get(self, request):
        from accounts.presence import count_online_users, presence_window_seconds

        try:
            system_health = _collect_system_health()
        except Exception:
            system_health = []

        return Response({
            'onlineNow': count_online_users(),
            'presenceWindowSeconds': presence_window_seconds(),
            'systemHealth': system_health,
            'serverTime': timezone.now().isoformat(),
        })


@document_api_view(tag="Dashboard", summary="Online users list")
class OnlineUsersView(views.APIView):
    """Return list of currently online users."""

    def get(self, request):
        from accounts.presence import list_online_users, presence_window_seconds
        return Response({
            'users': list_online_users(),
            'count': len(list_online_users()),
            'presenceWindowSeconds': presence_window_seconds(),
        })


FILE_UPLOAD_REQUEST = {
    "multipart/form-data": {
        "type": "object",
        "properties": {
            "file": {"type": "string", "format": "binary"},
            "folder": {"type": "string"},
        },
    }
}


@document_api_view(
    tag="Common",
    summary="Upload file to media storage",
    methods=("post",),
    responses=JSON_MUTATION_RESPONSES,
    request=FILE_UPLOAD_REQUEST,
)
class FileUploadView(views.APIView):
    """Handle file uploads (PDF and images only)."""
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "file_upload"
    
    def post(self, request):
        file = request.FILES.get('file')
        folder = request.data.get('folder', 'uploads')
        
        if not file:
            return Response({'error': 'No file provided'}, status=400)
        
        try:
            file_path = FileUploadService.upload_file(file, folder)
            return Response({'file_path': file_path, 'message': 'File uploaded successfully'})
        except UploadValidationError as exc:
            return Response({'error': str(exc)}, status=400)
        except Exception as e:
            return Response({'error': str(e)}, status=500)


@document_api_view(tag="Common", summary="Serve protected media file")
class ProtectedMediaView(views.APIView):
    """
    Serve files from MEDIA_ROOT after authentication.

    Accepts JWT via Authorization header or access-token cookie so images
    and PDFs work in the browser without public ``/media/`` URLs.
    """

    authentication_classes = [JWTAuthenticationWithActivity, JWTCookieAuthentication]

    def get(self, request, relative_path: str):
        try:
            abs_path = resolve_media_absolute_path(relative_path)
        except MediaPathError:
            return Response({'detail': 'Not found.'}, status=404)

        content_type = guess_media_content_type(abs_path)
        response = FileResponse(open(abs_path, 'rb'), content_type=content_type)
        response['Cache-Control'] = 'private, max-age=300'
        return response


@document_api_view(tag="Common", summary="Send email (admin)", methods=("post",), responses=JSON_MUTATION_RESPONSES)
class SendEmailView(views.APIView):
    """Send email (admin only)."""
    
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


@document_api_view(tag="Common", summary="Export backup data snapshot")
class ExportDataView(views.APIView):
    """Export data."""
    
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
