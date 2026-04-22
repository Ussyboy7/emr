"""
Serializers for the Permissions app.
"""
from rest_framework import serializers
from .models import Role, UserRole
from .role_permissions import normalize_role_permissions_list


class RoleSerializer(serializers.ModelSerializer):
    """Serializer for Role model."""

    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def validate_permissions(self, value):
        return normalize_role_permissions_list(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if 'permissions' in data:
            data['permissions'] = normalize_role_permissions_list(instance.permissions)
        return data

    def get_user_count(self, obj):
        return obj.user_roles.count()


class UserRoleSerializer(serializers.ModelSerializer):
    """Serializer for UserRole model."""
    
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    role_name = serializers.CharField(source='role.name', read_only=True)
    assigned_by_name = serializers.CharField(source='assigned_by.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = UserRole
        fields = '__all__'
        read_only_fields = ['assigned_at']

