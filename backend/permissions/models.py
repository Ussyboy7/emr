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
    # Format: {"module": ["page1", "page2"], ...}
    permissions = models.JSONField(default=dict, blank=True, help_text="Module and page permissions")
    
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'roles'
        ordering = ['name']
    
    def __str__(self):
        return self.name
    
    def has_permission(self, module: str, page: str = None) -> bool:
        """Check if role has permission for a module/page."""
        if not self.is_active:
            return False
        
        # Admin type has all permissions
        if self.type == 'admin':
            return True
        
        # Check module permissions
        if module in self.permissions:
            module_perms = self.permissions[module]
            # If page is specified, check if it's in the list or if '*' (all) is present
            if page:
                return '*' in module_perms or page in module_perms
            # If no page specified, check if module has any permissions
            return len(module_perms) > 0
        
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

