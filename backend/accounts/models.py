"""
User model and authentication for the EMR system.
"""
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class SystemRole(models.Model):
    """
    Professional role definitions for system users.
    Separated from permission-based access roles for better organization.
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class User(AbstractUser):
    """
    Custom User model for the EMR system.
    Extends Django's AbstractUser with EMR-specific fields.
    """

    # NPA-specific fields
    employee_id = models.CharField(max_length=50, unique=True, blank=True, null=True, db_index=True)
    grade_level = models.CharField(max_length=50, blank=True)
    system_role = models.CharField(max_length=50, blank=True)

    # New dynamic system role relationship
    system_role_obj = models.ForeignKey(
        SystemRole,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users'
    )
    
    # Organizational structure - linked to organization app
    location_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='staff',
        help_text="Home clinic where the user primarily works (e.g., Bode Thomas, HQ)"
    )
    department = models.ForeignKey(
        'organization.Department',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='staff',
        help_text="Department/Module the user belongs to (e.g., Medical Records, Nursing, Consultation)"
    )

    # Multi-clinic support
    location_clinics = models.ManyToManyField(
        'organization.Clinic',
        blank=True,
        related_name='assigned_staff',
        help_text="All clinics this user can access (for rotational staff)"
    )
    active_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='active_staff',
        help_text="Current clinic the user is actively working from (set at login/switch)"
    )
    
    # Legacy fields (kept for backward compatibility, can be removed later)
    directorate = models.CharField(max_length=100, blank=True)
    division = models.CharField(max_length=100, blank=True)
    
    # Additional metadata
    phone = models.CharField(max_length=20, blank=True)
    middle_name = models.CharField(max_length=150, blank=True)
    # Per-user page access overrides (applied to role-based pages during /auth/me).
    CUSTOM_PAGES_MODE_CHOICES = [
        ("", "Role-based only"),
        ("replace", "Replace role pages"),
        ("add", "Add to role pages"),
        ("restrict", "Restrict role pages"),
    ]
    custom_pages_mode = models.CharField(max_length=16, blank=True, default="", choices=CUSTOM_PAGES_MODE_CHOICES)
    custom_pages = models.JSONField(default=list, blank=True, help_text="Page paths used by custom_pages_mode")
    permissions_version = models.PositiveIntegerField(default=1)
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
            models.Index(fields=['location_clinic', 'department']),
        ]
    
    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.username})"
    
    def get_full_name(self):
        """Return the user's full name."""
        # Canonical display for EMR: Surname, First name, Middle name
        parts = [self.last_name, self.first_name, self.middle_name]
        name = " ".join([p for p in parts if p and str(p).strip()]).strip()
        if name:
            return name
        return self.username

