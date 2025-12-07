"""
Audit logging models for the EMR system.
"""
from django.db import models
from django.conf import settings


class ActivityLog(models.Model):
    """
    Comprehensive activity logging for audit trail.
    """
    
    ACTION_CHOICES = [
        ('create', 'Create'),
        ('read', 'Read'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('login', 'Login'),
        ('logout', 'Logout'),
        ('export', 'Export'),
        ('import', 'Import'),
        ('verify', 'Verify'),
        ('approve', 'Approve'),
        ('reject', 'Reject'),
    ]
    
    SEVERITY_CHOICES = [
        ('info', 'Info'),
        ('warning', 'Warning'),
        ('error', 'Error'),
        ('critical', 'Critical'),
    ]
    
    RESULT_CHOICES = [
        ('success', 'Success'),
        ('failure', 'Failure'),
        ('error', 'Error'),
    ]
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activity_logs'
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, db_index=True)
    result = models.CharField(max_length=10, choices=RESULT_CHOICES, default='success', db_index=True)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default='info', db_index=True)
    
    # Object being acted upon
    object_type = models.CharField(max_length=50, db_index=True, help_text="patient, visit, prescription, etc.")
    object_id = models.CharField(max_length=255, db_index=True)
    object_repr = models.CharField(max_length=255, blank=True)
    
    # Context
    module = models.CharField(max_length=50, db_index=True, help_text="patients, laboratory, pharmacy, etc.")
    description = models.TextField(blank=True)
    
    # Request information
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    
    # Change tracking
    old_values = models.JSONField(null=True, blank=True)
    new_values = models.JSONField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True, help_text="Additional context data")
    
    # Error information
    error_message = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    
    class Meta:
        db_table = 'activity_logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['object_type', 'object_id']),
            models.Index(fields=['module', 'action']),
            models.Index(fields=['created_at']),
            models.Index(fields=['severity', 'result']),
        ]
    
    def __str__(self):
        return f"{self.action} {self.object_type} by {self.user} at {self.created_at}"

