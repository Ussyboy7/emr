"""
Serializers for the Eye Care app.
"""
from rest_framework import serializers
from .models import EyeOrder, EyeSession


class EyeOrderSerializer(serializers.ModelSerializer):
    """Serializer for EyeOrder model."""
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    ordered_by_name = serializers.CharField(source='ordered_by.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = EyeOrder
        fields = [
            'id', 'patient', 'patient_name', 'patient_id', 'ordered_by', 'ordered_by_name',
            'visit', 'consultation_session',
            'chief_complaint', 'visual_acuity_od', 'visual_acuity_os', 'visual_acuity_ou',
            'refraction_od', 'refraction_os', 'iop_od', 'iop_os',
            'diagnosis', 'treatment_plan', 'special_instructions',
            'priority', 'status', 'ordered_at', 'scheduled_at', 'completed_at',
        ]
        read_only_fields = ['id', 'ordered_at']


class EyeOrderCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating eye orders."""

    class Meta:
        model = EyeOrder
        fields = [
            'patient', 'visit', 'consultation_session',
            'chief_complaint', 'visual_acuity_od', 'visual_acuity_os', 'visual_acuity_ou',
            'refraction_od', 'refraction_os', 'iop_od', 'iop_os',
            'diagnosis', 'treatment_plan', 'special_instructions',
            'priority'
        ]


class EyeSessionSerializer(serializers.ModelSerializer):
    """Serializer for EyeSession model."""
    patient_name = serializers.CharField(source='order.patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='order.patient.patient_id', read_only=True)
    order_details = EyeOrderSerializer(source='order', read_only=True)

    class Meta:
        model = EyeSession
        fields = [
            'id', 'order', 'order_details',
            'session_number', 'status', 'scheduled_at', 'started_at', 'completed_at',
            'duration_minutes', 'notes', 'procedures_performed', 'findings', 'soap_note', 'created_at',
            'pachymetry_file', 'oct_file', 'visual_field_file',
            'patient_name', 'patient_id',
        ]
        read_only_fields = ['id', 'created_at']


class EyeSessionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating eye sessions."""

    class Meta:
        model = EyeSession
        fields = [
            'id', 'order', 'session_number', 'status', 'scheduled_at',
            'started_at', 'completed_at', 'duration_minutes',
            'notes', 'procedures_performed', 'findings', 'soap_note', 'created_at',
            'pachymetry_file', 'oct_file', 'visual_field_file',
        ]
        read_only_fields = ['id', 'created_at']
