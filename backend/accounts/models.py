"""
User model and authentication for the EMR system.
"""
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """
    Custom User model for the EMR system.
    Extends Django's AbstractUser with EMR-specific fields.
    """
    
    SYSTEM_ROLE_CHOICES = [
        ('System Administrator', 'System Administrator'),
        ('Medical Doctor', 'Medical Doctor'),
        ('Nursing Officer', 'Nursing Officer'),
        ('Laboratory Scientist', 'Laboratory Scientist'),
        ('Pharmacist', 'Pharmacist'),
        ('Radiologist', 'Radiologist'),
        ('Medical Records Officer', 'Medical Records Officer'),
        ('Admin Staff', 'Admin Staff'),
    ]
    
    # NPA-specific fields
    employee_id = models.CharField(max_length=50, unique=True, blank=True, null=True, db_index=True)
    grade_level = models.CharField(max_length=50, blank=True)
    system_role = models.CharField(max_length=50, choices=SYSTEM_ROLE_CHOICES, blank=True)
    
    # Organizational structure (will be linked to organization app)
    directorate = models.CharField(max_length=100, blank=True)
    division = models.CharField(max_length=100, blank=True)
    department = models.CharField(max_length=100, blank=True)
    
    # Additional metadata
    phone = models.CharField(max_length=20, blank=True)
    bio = models.TextField(blank=True, help_text="User biography or notes")
    is_management = models.BooleanField(default=False)
    last_activity = models.DateTimeField(null=True, blank=True, help_text="Last time the user was active")
    
    # Profile picture
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    
    class Meta:
        db_table = 'users'
        ordering = ['username']
        indexes = [
            models.Index(fields=['employee_id']),
            models.Index(fields=['system_role']),
            models.Index(fields=['email']),
        ]
    
    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.username})"
    
    def get_full_name(self):
        """Return the user's full name."""
        if self.first_name or self.last_name:
            return f"{self.first_name} {self.last_name}".strip()
        return self.username

