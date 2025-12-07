"""
Admin configuration for the Notifications app.
"""
from django.contrib import admin
from .models import Notification, NotificationPreferences


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'type', 'priority', 'status', 'created_at']
    list_filter = ['type', 'priority', 'status', 'created_at']
    search_fields = ['title', 'message', 'user__username']
    readonly_fields = ['created_at', 'read_at']


@admin.register(NotificationPreferences)
class NotificationPreferencesAdmin(admin.ModelAdmin):
    list_display = ['user', 'in_app_enabled', 'email_enabled', 'updated_at']
    list_filter = ['in_app_enabled', 'email_enabled']
    search_fields = ['user__username']

