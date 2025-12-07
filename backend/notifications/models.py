"""
Notifications models for the EMR system.
"""
from django.db import models
from django.conf import settings


class Notification(models.Model):
    """
    In-app notifications for users.
    """
    
    TYPE_CHOICES = [
        ('workflow', 'Workflow'),
        ('lab_result', 'Lab Result'),
        ('radiology_result', 'Radiology Result'),
        ('prescription', 'Prescription'),
        ('appointment', 'Appointment'),
        ('system', 'System'),
        ('alert', 'Alert'),
        ('reminder', 'Reminder'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    STATUS_CHOICES = [
        ('unread', 'Unread'),
        ('read', 'Read'),
        ('archived', 'Archived'),
    ]
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='system', db_index=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal', db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='unread', db_index=True)
    
    title = models.CharField(max_length=200)
    message = models.TextField()
    action_url = models.URLField(blank=True, help_text="URL to navigate when notification is clicked")
    
    # Related object reference
    object_type = models.CharField(max_length=50, blank=True, help_text="patient, lab_order, prescription, etc.")
    object_id = models.CharField(max_length=255, blank=True)
    
    # Metadata
    metadata = models.JSONField(default=dict, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status', '-created_at']),
            models.Index(fields=['type', 'priority']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f"{self.title} - {self.user.username}"
    
    def mark_as_read(self):
        """Mark notification as read."""
        from django.utils import timezone
        self.status = 'read'
        self.read_at = timezone.now()
        self.save()


class NotificationPreferences(models.Model):
    """
    User notification preferences.
    """
    
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notification_preferences'
    )
    
    # Delivery methods
    in_app_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=False)
    sms_enabled = models.BooleanField(default=False)
    
    # Module filters
    lab_results_enabled = models.BooleanField(default=True)
    radiology_results_enabled = models.BooleanField(default=True)
    prescriptions_enabled = models.BooleanField(default=True)
    appointments_enabled = models.BooleanField(default=True)
    system_alerts_enabled = models.BooleanField(default=True)
    
    # Priority filters
    low_priority_enabled = models.BooleanField(default=True)
    normal_priority_enabled = models.BooleanField(default=True)
    high_priority_enabled = models.BooleanField(default=True)
    urgent_priority_enabled = models.BooleanField(default=True)
    
    # Quiet hours
    quiet_hours_enabled = models.BooleanField(default=False)
    quiet_hours_start = models.TimeField(null=True, blank=True, help_text="e.g., 22:00")
    quiet_hours_end = models.TimeField(null=True, blank=True, help_text="e.g., 08:00")
    
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'notification_preferences'
    
    def __str__(self):
        return f"Preferences for {self.user.username}"

