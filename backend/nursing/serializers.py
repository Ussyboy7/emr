"""
Serializers for the Nursing app.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes
from .models import NursingOrder, Procedure


class NursingOrderSerializer(serializers.ModelSerializer):
    """Serializer for NursingOrder model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    patient_gender = serializers.CharField(source='patient.gender', read_only=True)
    patient_personal_number = serializers.CharField(source='patient.personal_number', read_only=True)
    patient_age = serializers.SerializerMethodField()
    patient_allergies = serializers.SerializerMethodField()
    ordered_by_name = serializers.CharField(source='ordered_by.get_full_name', read_only=True, allow_null=True)
    admission_id_display = serializers.CharField(source='admission.admission_id', read_only=True, allow_null=True)

    @extend_schema_field(OpenApiTypes.STR)
    def get_patient_age(self, obj):
        if not obj.patient_id or not obj.patient.date_of_birth:
            return None
        d = obj.patient.date_of_birth
        today = timezone.now().date()
        return today.year - d.year - ((today.month, today.day) < (d.month, d.day))

    @extend_schema_field(OpenApiTypes.STR)
    def get_patient_allergies(self, obj):
        if not obj.patient_id:
            return []
        mh = getattr(obj.patient, "medical_history", None)
        if not mh or not mh.allergies:
            return []
        if isinstance(mh.allergies, list):
            return [str(a) for a in mh.allergies if a is not None]
        if isinstance(mh.allergies, str):
            return [a.strip() for a in mh.allergies.replace("\n", ",").split(",") if a.strip()]
        return []

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
        if new_status == 'completed' and not instance.completed_at:
            validated_data['completed_at'] = timezone.now()
        return super().update(instance, validated_data)


class ProcedureSerializer(serializers.ModelSerializer):
    """Serializer for Procedure model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    patient_gender = serializers.CharField(source='patient.gender', read_only=True)
    patient_category = serializers.CharField(source='patient.category', read_only=True)
    patient_blood_group = serializers.CharField(source='patient.blood_group', read_only=True, allow_null=True)
    patient_age = serializers.SerializerMethodField()
    patient_date_of_birth = serializers.DateField(
        source='patient.date_of_birth', read_only=True, allow_null=True
    )
    ordered_by_name = serializers.SerializerMethodField()
    performed_by_name = serializers.CharField(source='performed_by.get_full_name', read_only=True, allow_null=True)

    @extend_schema_field(OpenApiTypes.STR)
    def get_patient_age(self, obj):
        if not obj.patient_id or not obj.patient.date_of_birth:
            return None
        d = obj.patient.date_of_birth
        today = timezone.now().date()
        return today.year - d.year - ((today.month, today.day) < (d.month, d.day))

    @extend_schema_field(OpenApiTypes.STR)
    def get_ordered_by_name(self, obj):
        order = getattr(obj, 'nursing_order', None)
        if order and order.ordered_by_id:
            return order.ordered_by.get_full_name() or ''
        return ''

    def validate(self, attrs):
        nursing_order = attrs.get('nursing_order')
        patient = attrs.get('patient')
        if nursing_order is None and self.instance:
            nursing_order = self.instance.nursing_order
        if patient is None and self.instance:
            patient = self.instance.patient
        if nursing_order and patient and nursing_order.patient_id != patient.id:
            raise serializers.ValidationError(
                {'patient': ['Procedure patient must match the linked nursing order patient.']}
            )
        if nursing_order and patient is None:
            attrs['patient'] = nursing_order.patient
        return attrs

    class Meta:
        model = Procedure
        fields = '__all__'
        read_only_fields = ['procedure_id', 'performed_at']

