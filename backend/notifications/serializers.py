"""
Serializers for the Notifications app.
"""
from rest_framework import serializers
from .models import Notification, NotificationPreferences


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for Notification model."""
    
    class Meta:
        model = Notification
        fields = '__all__'
        read_only_fields = ['created_at', 'read_at']


class NotificationPreferencesSerializer(serializers.ModelSerializer):
    """Serializer for NotificationPreferences model."""
    
    class Meta:
        model = NotificationPreferences
        fields = '__all__'
        read_only_fields = ['user', 'updated_at']

