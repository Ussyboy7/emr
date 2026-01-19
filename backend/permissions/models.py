"""
Permissions and Roles models for the EMR system.
"""
from django.db import models
from django.conf import settings


class Role(models.Model):
    """
    User roles with permissions.
    """
    
    TYPE_CHOICES = [
        ('admin', 'Administrator'),
        ('doctor', 'Doctor'),
        ('nurse', 'Nurse'),
        ('lab_tech', 'Lab Technician'),
        ('pharmacist', 'Pharmacist'),
        ('radiologist', 'Radiologist'),
        ('records', 'Medical Records'),
        ('custom', 'Custom'),
    ]
    
    name = models.CharField(max_length=100, unique=True, db_index=True)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='custom')
    description = models.TextField(blank=True)
    
    # Permissions - stored as JSON for flexibility
    # Format: ["/page1", "/page2", "/module/page3"] - list of allowed page URLs
    permissions = models.JSONField(default=list, blank=True, help_text="List of allowed page URLs")
    
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'roles'
        ordering = ['name']
    
    def __str__(self):
        return self.name
    
    def has_permission(self, module: str, page: str = None) -> bool:
        """Check if role has permission for a page."""
        if not self.is_active:
            return False

        # Admin type has all permissions
        if self.type == 'admin':
            return True

        # Check if the specific page URL is in the allowed pages list
        allowed_pages = self.permissions or []
        if isinstance(allowed_pages, list):
            # Check exact page match
            if page and page in allowed_pages:
                return True
            # Check if module dashboard is allowed (for module-level access)
            module_dashboard = f"/{module.lower().replace(' ', '-')}"
            if module_dashboard in allowed_pages:
                return True

        return False

    def has_page_access(self, page_url: str) -> bool:
        """Check if role has access to a specific page URL."""
        if not self.is_active:
            return False

        # Admin type has all permissions
        if self.type == 'admin':
            return True

        allowed_pages = self.permissions or []
        if isinstance(allowed_pages, list):
            return page_url in allowed_pages

        return False


class UserRole(models.Model):
    """
    Many-to-many relationship between Users and Roles.
    """
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='user_roles'
    )
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='user_roles')
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_roles'
    )
    
    class Meta:
        db_table = 'user_roles'
        unique_together = [['user', 'role']]
        ordering = ['-assigned_at']
    
    def __str__(self):
        return f"{self.user.username} - {self.role.name}"

