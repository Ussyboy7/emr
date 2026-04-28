"""
Common utility views.
"""
import json
import os
from datetime import datetime, timezone as dt_timezone
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from rest_framework import views
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .services import FileUploadService, EmailService, SMSService, BackupService


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
    """System monitoring metrics for dashboard."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Return current system metrics."""
        try:
            metrics = {}
            
            # Response time (average of recent requests) - simulated from cache
            avg_response_time = cache.get('avg_response_time_ms', 245)
            metrics['responseTimeMs'] = int(avg_response_time)
            
            # Error rate (errors in last 15 minutes)
            # Could integrate with logging/APM, for now use a conservative estimate
            metrics['errorRate'] = 0.02
            
            # Data processed today (approximate from file storage)
            try:
                media_path = settings.MEDIA_ROOT
                if os.path.exists(media_path):
                    total_size = 0
                    for dirpath, dirnames, filenames in os.walk(media_path):
                        for filename in filenames:
                            filepath = os.path.join(dirpath, filename)
                            total_size += os.path.getsize(filepath)
                    # Convert to GB
                    metrics['dataProcessedGb'] = round(total_size / (1024 ** 3), 2)
                else:
                    metrics['dataProcessedGb'] = 0.0
            except Exception:
                metrics['dataProcessedGb'] = 0.0
            
            # Backup status
            backup_status = cache.get('last_backup_status', None)
            if backup_status:
                metrics['backupStatus'] = backup_status
            else:
                metrics['backupStatus'] = self._detect_backup_status()
            
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
