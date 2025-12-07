"""
Common services for file uploads, email, SMS, and backup.
"""
import logging
import os
from typing import Optional
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

logger = logging.getLogger(__name__)


class FileUploadService:
    """Service for handling file uploads."""
    
    @staticmethod
    def upload_file(file, folder: str = 'uploads', filename: Optional[str] = None) -> str:
        """Upload a file and return the file path."""
        try:
            if filename is None:
                filename = file.name
            
            # Create folder path
            file_path = os.path.join(folder, filename)
            
            # Save file
            saved_path = default_storage.save(file_path, ContentFile(file.read()))
            return saved_path
        except Exception as e:
            logger.error(f"Error uploading file: {str(e)}")
            raise
    
    @staticmethod
    def delete_file(file_path: str) -> bool:
        """Delete a file."""
        try:
            if default_storage.exists(file_path):
                default_storage.delete(file_path)
                return True
            return False
        except Exception as e:
            logger.error(f"Error deleting file: {str(e)}")
            return False


class EmailService:
    """Service for sending emails."""
    
    @staticmethod
    def send_email(
        recipient_email: str,
        subject: str,
        message: str,
        html_message: Optional[str] = None,
        from_email: Optional[str] = None,
    ) -> bool:
        """Send an email."""
        try:
            if from_email is None:
                from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@npa.gov.ng')
            
            send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=[recipient_email],
                html_message=html_message,
                fail_silently=False,
            )
            logger.info(f"Email sent to {recipient_email}: {subject}")
            return True
        except Exception as e:
            logger.error(f"Error sending email: {str(e)}")
            return False
    
    @staticmethod
    def send_notification_email(user, notification) -> bool:
        """Send email notification."""
        if not user.email:
            return False
        
        subject = f"EMR Notification: {notification.title}"
        message = notification.message
        html_message = f"""
        <html>
        <body>
            <h2>{notification.title}</h2>
            <p>{notification.message}</p>
            {f'<p><a href="{notification.action_url}">View Details</a></p>' if notification.action_url else ''}
        </body>
        </html>
        """
        
        return EmailService.send_email(
            recipient_email=user.email,
            subject=subject,
            message=message,
            html_message=html_message,
        )


class SMSService:
    """Service for sending SMS (placeholder - integrate with SMS provider)."""
    
    @staticmethod
    def send_sms(phone_number: str, message: str) -> bool:
        """Send SMS (placeholder - implement with actual SMS provider)."""
        try:
            # TODO: Integrate with SMS provider (e.g., Twilio, AWS SNS)
            logger.info(f"SMS would be sent to {phone_number}: {message[:50]}...")
            return True
        except Exception as e:
            logger.error(f"Error sending SMS: {str(e)}")
            return False


class BackupService:
    """Service for data backup and export."""
    
    @staticmethod
    def export_patients(format: str = 'json') -> dict:
        """Export patient data."""
        from patients.models import Patient
        from patients.serializers import PatientListSerializer
        
        patients = Patient.objects.filter(is_active=True)
        serializer = PatientListSerializer(patients, many=True)
        return {
            'format': format,
            'count': patients.count(),
            'data': serializer.data,
            'exported_at': timezone.now().isoformat(),
        }
    
    @staticmethod
    def export_lab_results(format: str = 'json') -> dict:
        """Export lab results data."""
        from laboratory.models import LabTest
        
        results = LabTest.objects.filter(status='verified')
        data = []
        for result in results:
            data.append({
                'test_id': result.id,
                'order_id': result.order.order_id,
                'patient': result.order.patient.get_full_name(),
                'test_name': result.name,
                'results': result.results,
                'verified_at': result.verified_at.isoformat() if result.verified_at else None,
            })
        
        return {
            'format': format,
            'count': len(data),
            'data': data,
            'exported_at': timezone.now().isoformat(),
        }

