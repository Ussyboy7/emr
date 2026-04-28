"""
Common utility views.
"""
from django.conf import settings
from django.db import connection
from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
import json

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
        from django.utils import timezone
        from django.db.models import Count, Q
        from datetime import timedelta
        import os
        
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
                # Check if backup file exists and was recent
                backups_path = getattr(settings, 'BACKUP_DIR', './backups')
                if os.path.exists(backups_path):
                    try:
                        files = [f for f in os.listdir(backups_path) if f.endswith('.sql')]
                        if files:
                            latest_backup = max(files, key=lambda f: os.path.getctime(os.path.join(backups_path, f)))
                            backup_time = os.path.getctime(os.path.join(backups_path, latest_backup))
                            last_backup = timezone.datetime.fromtimestamp(backup_time, tz=timezone.utc)
                            hours_ago = (timezone.now() - last_backup).total_seconds() / 3600
                            metrics['backupStatus'] = {
                                'status': 'healthy' if hours_ago < 25 else 'warning',
                                'lastBackup': last_backup.isoformat(),
                                'hoursAgo': round(hours_ago, 1),
                                'filename': latest_backup
                            }
                        else:
                            metrics['backupStatus'] = {'status': 'unknown', 'message': 'No backup found'}
                    except Exception as e:
                        metrics['backupStatus'] = {'status': 'error', 'message': str(e)}
                else:
                    metrics['backupStatus'] = {'status': 'unknown', 'message': 'Backup directory not found'}
            
            return Response(metrics)
        except Exception as e:
            return Response({'error': str(e)}, status=500)



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

