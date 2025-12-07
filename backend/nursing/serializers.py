"""
Serializers for the Nursing app.
"""
from rest_framework import serializers
from .models import NursingOrder, Procedure


class NursingOrderSerializer(serializers.ModelSerializer):
    """Serializer for NursingOrder model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    ordered_by_name = serializers.CharField(source='ordered_by.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = NursingOrder
        fields = '__all__'
        read_only_fields = ['order_id', 'ordered_at', 'created_at']


class ProcedureSerializer(serializers.ModelSerializer):
    """Serializer for Procedure model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    performed_by_name = serializers.CharField(source='performed_by.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = Procedure
        fields = '__all__'
        read_only_fields = ['procedure_id', 'performed_at']

