"""
Serializers for the Radiology app.
"""
from rest_framework import serializers
from .models import RadiologyOrder, RadiologyStudy, RadiologyReport


class RadiologyStudySerializer(serializers.ModelSerializer):
    """Serializer for RadiologyStudy model."""
    
    scheduled_by_name = serializers.CharField(source='scheduled_by.get_full_name', read_only=True, allow_null=True)
    acquired_by_name = serializers.CharField(source='acquired_by.get_full_name', read_only=True, allow_null=True)
    reported_by_name = serializers.CharField(source='reported_by.get_full_name', read_only=True, allow_null=True)
    verified_by_name = serializers.CharField(source='verified_by.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = RadiologyStudy
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class RadiologyOrderSerializer(serializers.ModelSerializer):
    """Serializer for RadiologyOrder model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    studies = RadiologyStudySerializer(many=True, read_only=True)
    
    class Meta:
        model = RadiologyOrder
        fields = '__all__'
        read_only_fields = ['order_id', 'ordered_at', 'created_at']


class RadiologyReportSerializer(serializers.ModelSerializer):
    """Serializer for RadiologyReport model."""
    
    study_details = RadiologyStudySerializer(source='study', read_only=True)
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    order_id = serializers.CharField(source='order.order_id', read_only=True)
    
    class Meta:
        model = RadiologyReport
        fields = '__all__'
        read_only_fields = ['created_at']

