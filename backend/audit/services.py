"""
Audit service for logging activities.
"""
import logging
from typing import Dict, Any, Optional
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
from django.http import HttpRequest
from .models import ActivityLog

logger = logging.getLogger(__name__)
User = get_user_model()


class AuditService:
    """Service for managing audit logs."""
    
    @staticmethod
    def _get_client_ip(request: HttpRequest) -> Optional[str]:
        """Extract client IP address from request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
    
    @staticmethod
    def log_activity(
        user,
        action: str,
        object_type: str,
        object_id: str,
        module: str,
        result: str = 'success',
        severity: str = 'info',
        object_repr: str = '',
        description: str = '',
        old_values: Optional[Dict[str, Any]] = None,
        new_values: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        error_message: str = '',
        request: Optional[HttpRequest] = None,
    ) -> ActivityLog:
        """Log a user activity."""
        try:
            ip_address = None
            user_agent = ''
            if request:
                ip_address = AuditService._get_client_ip(request)
                user_agent = request.META.get('HTTP_USER_AGENT', '')
            
            log = ActivityLog.objects.create(
                user=user,
                action=action,
                result=result,
                severity=severity,
                object_type=object_type,
                object_id=str(object_id),
                object_repr=object_repr,
                module=module,
                description=description,
                ip_address=ip_address,
                user_agent=user_agent,
                old_values=old_values or {},
                new_values=new_values or {},
                metadata=metadata or {},
                error_message=error_message,
            )
            
            logger.info(f"Audit log created: {action} {object_type} by {user} in {module}")
            return log
        except Exception as e:
            logger.error(f"Error creating audit log: {str(e)}")
            raise
    
    @staticmethod
    def log_patient_action(
        user,
        action: str,
        patient,
        module: str = 'patients',
        old_values: Optional[Dict[str, Any]] = None,
        new_values: Optional[Dict[str, Any]] = None,
        description: str = '',
        request: Optional[HttpRequest] = None,
    ) -> ActivityLog:
        """Log a patient-related action."""
        return AuditService.log_activity(
            user=user,
            action=action,
            object_type='patient',
            object_id=str(patient.id),
            module=module,
            object_repr=patient.get_full_name(),
            description=description,
            old_values=old_values,
            new_values=new_values,
            request=request,
        )
    
    @staticmethod
    def log_lab_action(
        user,
        action: str,
        lab_order,
        module: str = 'laboratory',
        description: str = '',
        request: Optional[HttpRequest] = None,
    ) -> ActivityLog:
        """Log a laboratory-related action."""
        return AuditService.log_activity(
            user=user,
            action=action,
            object_type='lab_order',
            object_id=str(lab_order.id),
            module=module,
            object_repr=f"Lab Order {lab_order.order_id}",
            description=description,
            request=request,
        )
    
    @staticmethod
    def log_prescription_action(
        user,
        action: str,
        prescription,
        module: str = 'pharmacy',
        description: str = '',
        request: Optional[HttpRequest] = None,
    ) -> ActivityLog:
        """Log a prescription-related action."""
        return AuditService.log_activity(
            user=user,
            action=action,
            object_type='prescription',
            object_id=str(prescription.id),
            module=module,
            object_repr=f"Prescription {prescription.prescription_id}",
            description=description,
            request=request,
        )

