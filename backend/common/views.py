"""
Common utility views.
"""
from django.db import connection
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
import json

from .services import FileUploadService, EmailService, SMSService, BackupService


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

