"""
Serializers for the Organization app.
"""
from rest_framework import serializers
from .models import Clinic, Department, Room


class ClinicSerializer(serializers.ModelSerializer):
    """Serializer for Clinic model."""
    
    class Meta:
        model = Clinic
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class DepartmentSerializer(serializers.ModelSerializer):
    """Serializer for Department model."""
    
    clinic_name = serializers.CharField(source='clinic.name', read_only=True)
    head_name = serializers.CharField(source='head.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = Department
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class RoomSerializer(serializers.ModelSerializer):
    """Serializer for Room model."""
    
    clinic_name = serializers.CharField(source='clinic.name', read_only=True, allow_null=True)
    department_name = serializers.CharField(source='department.name', read_only=True, allow_null=True)
    
    class Meta:
        model = Room
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

