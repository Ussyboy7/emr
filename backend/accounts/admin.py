"""
Admin configuration for the Accounts app.
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ['username', 'email', 'get_full_name', 'system_role', 'employee_id', 'is_active', 'is_staff', 'date_joined']
    list_filter = ['system_role', 'is_active', 'is_staff', 'is_management', 'date_joined']
    search_fields = ['username', 'email', 'first_name', 'last_name', 'employee_id']
    fieldsets = DjangoUserAdmin.fieldsets + (
        ('NPA Information', {
            'fields': ('employee_id', 'grade_level', 'system_role', 'directorate', 'division', 'department', 'is_management')
        }),
        ('Additional Information', {
            'fields': ('phone', 'bio', 'avatar', 'last_activity')
        }),
    )

