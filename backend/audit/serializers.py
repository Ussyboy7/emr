"""
Serializers for the Audit app.
"""
from rest_framework import serializers
from .models import ActivityLog


class ActivityLogSerializer(serializers.ModelSerializer):
    """Serializer for ActivityLog model."""
    
    user_name = serializers.CharField(source='user.get_full_name', read_only=True, allow_null=True)
    user_username = serializers.CharField(source='user.username', read_only=True, allow_null=True)
    
    class Meta:
        model = ActivityLog
        fields = '__all__'
        read_only_fields = ['created_at']

