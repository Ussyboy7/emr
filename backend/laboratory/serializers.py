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
    collected_by_name = serializers.SerializerMethodField()
    processed_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    
    def get_collected_by_name(self, obj):
        """Get collected by user full name."""
        return obj.collected_by.get_full_name() if obj.collected_by else None
    
    def get_processed_by_name(self, obj):
        """Get processed by user full name."""
        return obj.processed_by.get_full_name() if obj.processed_by else None
    
    def get_verified_by_name(self, obj):
        """Get verified by user full name."""
        return obj.verified_by.get_full_name() if obj.verified_by else None
    
    class Meta:
        model = LabTest
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class LabOrderSerializer(serializers.ModelSerializer):
    """Serializer for LabOrder model."""
    
    patient_name = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    tests = LabTestSerializer(many=True, read_only=True)
    
    def get_patient_name(self, obj):
        """Get patient full name."""
        return obj.patient.get_full_name() if obj.patient else None
    
    def get_doctor_name(self, obj):
        """Get doctor full name."""
        return obj.doctor.get_full_name() if obj.doctor else None
    
    class Meta:
        model = LabOrder
        fields = '__all__'
        read_only_fields = ['order_id', 'ordered_at', 'created_at']


class LabResultSerializer(serializers.ModelSerializer):
    """Serializer for LabResult model."""
    
    test_details = LabTestSerializer(source='test', read_only=True)
    patient_name = serializers.SerializerMethodField()
    order_id = serializers.CharField(source='order.order_id', read_only=True)
    order = LabOrderSerializer(read_only=True)
    patient = serializers.SerializerMethodField()
    
    def get_patient_name(self, obj):
        """Get patient full name."""
        return obj.patient.get_full_name() if obj.patient else None
    
    def get_patient(self, obj):
        """Get patient details."""
        if obj.patient:
            return {
                'id': obj.patient.id,
                'name': obj.patient.get_full_name(),
                'age': getattr(obj.patient, 'age', None),
                'gender': getattr(obj.patient, 'gender', None),
            }
        return None
    
    class Meta:
        model = LabResult
        fields = '__all__'
        read_only_fields = ['created_at']

