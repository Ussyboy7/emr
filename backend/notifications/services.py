"""
Notification service for creating and sending notifications.
"""
import logging
from typing import Optional, List
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
from .models import Notification, NotificationPreferences

logger = logging.getLogger(__name__)
User = get_user_model()


class NotificationService:
    """Service for managing notifications."""
    
    @staticmethod
    def get_or_create_preferences(user) -> NotificationPreferences:
        """Get or create notification preferences for a user."""
        preferences, created = NotificationPreferences.objects.get_or_create(user=user)
        return preferences
    
    @staticmethod
    def should_send_notification(user, notification_type: str, priority: str) -> bool:
        """Check if notification should be sent based on user preferences."""
        try:
            prefs = NotificationService.get_or_create_preferences(user)
            
            # Check if in-app notifications are enabled
            if not prefs.in_app_enabled:
                return False
            
            # Check module filter
            if notification_type == 'lab_result' and not prefs.lab_results_enabled:
                return False
            if notification_type == 'radiology_result' and not prefs.radiology_results_enabled:
                return False
            if notification_type == 'prescription' and not prefs.prescriptions_enabled:
                return False
            if notification_type == 'appointment' and not prefs.appointments_enabled:
                return False
            if notification_type == 'system' and not prefs.system_alerts_enabled:
                return False
            
            # Check priority filter
            if priority == 'low' and not prefs.low_priority_enabled:
                return False
            if priority == 'normal' and not prefs.normal_priority_enabled:
                return False
            if priority == 'high' and not prefs.high_priority_enabled:
                return False
            if priority == 'urgent' and not prefs.urgent_priority_enabled:
                return False
            
            # Check quiet hours
            if prefs.quiet_hours_enabled and prefs.quiet_hours_start and prefs.quiet_hours_end:
                now = timezone.now().time()
                if prefs.quiet_hours_start <= prefs.quiet_hours_end:
                    # Normal case: start < end (e.g., 22:00 to 08:00)
                    if prefs.quiet_hours_start <= now <= prefs.quiet_hours_end:
                        return False
                else:
                    # Wraps midnight (e.g., 22:00 to 08:00)
                    if now >= prefs.quiet_hours_start or now <= prefs.quiet_hours_end:
                        return False
            
            return True
        except Exception as e:
            logger.error(f"Error checking notification preferences: {str(e)}")
            return True  # Default to sending if error
    
    @staticmethod
    def create_notification(
        user,
        title: str,
        message: str,
        notification_type: str = 'system',
        priority: str = 'normal',
        action_url: str = '',
        object_type: str = '',
        object_id: str = '',
        metadata: dict = None,
    ) -> Optional[Notification]:
        """Create a notification for a user."""
        try:
            if not NotificationService.should_send_notification(user, notification_type, priority):
                logger.info(f"Notification skipped for {user.username} due to preferences")
                return None
            
            notification = Notification.objects.create(
                user=user,
                title=title,
                message=message,
                type=notification_type,
                priority=priority,
                action_url=action_url,
                object_type=object_type,
                object_id=object_id,
                metadata=metadata or {},
            )
            
            logger.info(f"Notification created for {user.username}: {title}")
            return notification
        except Exception as e:
            logger.error(f"Error creating notification: {str(e)}")
            return None
    
    @staticmethod
    def notify_role(
        role_name: str,
        title: str,
        message: str,
        notification_type: str = 'system',
        priority: str = 'normal',
        action_url: str = '',
        object_type: str = '',
        object_id: str = '',
    ) -> List[Notification]:
        """Create notifications for all users with a specific role."""
        notifications = []
        try:
            # Get users by system_role (assuming User model has system_role field)
            users = User.objects.filter(system_role=role_name, is_active=True)
            for user in users:
                notification = NotificationService.create_notification(
                    user=user,
                    title=title,
                    message=message,
                    notification_type=notification_type,
                    priority=priority,
                    action_url=action_url,
                    object_type=object_type,
                    object_id=object_id,
                )
                if notification:
                    notifications.append(notification)
            
            logger.info(f"Created {len(notifications)} notifications for role {role_name}")
        except Exception as e:
            logger.error(f"Error notifying role {role_name}: {str(e)}")
        
        return notifications
    
    @staticmethod
    def notify_users(
        users: List[User],
        title: str,
        message: str,
        notification_type: str = 'system',
        priority: str = 'normal',
        action_url: str = '',
        object_type: str = '',
        object_id: str = '',
    ) -> List[Notification]:
        """Create notifications for a list of users."""
        notifications = []
        for user in users:
            notification = NotificationService.create_notification(
                user=user,
                title=title,
                message=message,
                notification_type=notification_type,
                priority=priority,
                action_url=action_url,
                object_type=object_type,
                object_id=object_id,
            )
            if notification:
                notifications.append(notification)
        
        return notifications

