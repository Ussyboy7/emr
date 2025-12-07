"""
Serializers for the Laboratory app.
"""
from rest_framework import serializers
from .models import LabTemplate, LabOrder, LabTest, LabResult


class LabTemplateSerializer(serializers.ModelSerializer):
    """Serializer for LabTemplate model."""
    
    class Meta:
        model = LabTemplate
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class LabTestSerializer(serializers.ModelSerializer):
    """Serializer for LabTest model."""
    
    template_name = serializers.CharField(source='template.name', read_only=True, allow_null=True)
    collected_by_name = serializers.CharField(source='collected_by.get_full_name', read_only=True, allow_null=True)
    processed_by_name = serializers.CharField(source='processed_by.get_full_name', read_only=True, allow_null=True)
    verified_by_name = serializers.CharField(source='verified_by.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = LabTest
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class LabOrderSerializer(serializers.ModelSerializer):
    """Serializer for LabOrder model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    tests = LabTestSerializer(many=True, read_only=True)
    
    class Meta:
        model = LabOrder
        fields = '__all__'
        read_only_fields = ['order_id', 'ordered_at', 'created_at']


class LabResultSerializer(serializers.ModelSerializer):
    """Serializer for LabResult model."""
    
    test_details = LabTestSerializer(source='test', read_only=True)
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    order_id = serializers.CharField(source='order.order_id', read_only=True)
    
    class Meta:
        model = LabResult
        fields = '__all__'
        read_only_fields = ['created_at']

