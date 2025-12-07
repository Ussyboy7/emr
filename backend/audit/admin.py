"""
Admin configuration for the Audit app.
"""
from django.contrib import admin
from .models import ActivityLog


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ['action', 'object_type', 'object_repr', 'user', 'module', 'severity', 'result', 'created_at']
    list_filter = ['action', 'module', 'severity', 'result', 'created_at']
    search_fields = ['description', 'object_repr', 'user__username', 'user__email']
    readonly_fields = ['created_at']
    date_hierarchy = 'created_at'

