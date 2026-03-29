"""
Serializers for the Nursing app.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers
from .models import NursingOrder, Procedure


class NursingOrderSerializer(serializers.ModelSerializer):
    """Serializer for NursingOrder model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    ordered_by_name = serializers.CharField(source='ordered_by.get_full_name', read_only=True, allow_null=True)
    admission_id_display = serializers.CharField(source='admission.admission_id', read_only=True, allow_null=True)

    class Meta:
        model = NursingOrder
        fields = '__all__'
        read_only_fields = ['order_id', 'ordered_at']

    def validate_order_type(self, value):
        """Normalize legacy/new observation admission order type names."""
        normalized = (value or '').strip().lower()
        if normalized in {'ward admission', 'observation admission'}:
            return 'observation admission'
        return value

    def update(self, instance, validated_data):
        if instance.status in ('completed', 'cancelled'):
            raise serializers.ValidationError(
                {'non_field_errors': ['This order is finalized and cannot be changed.']}
            )
        new_status = validated_data.get('status', instance.status)
        if new_status == 'cancelled' and instance.status not in ('pending', 'in_progress'):
            raise serializers.ValidationError(
                {'status': ['Only pending or in-progress orders can be cancelled.']}
            )
        return super().update(instance, validated_data)


class ProcedureSerializer(serializers.ModelSerializer):
    """Serializer for Procedure model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    performed_by_name = serializers.CharField(source='performed_by.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = Procedure
        fields = '__all__'
        read_only_fields = ['procedure_id', 'performed_at']

