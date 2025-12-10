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
    patient_details = serializers.SerializerMethodField()
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    doctor_details = serializers.SerializerMethodField()
    studies = RadiologyStudySerializer(many=True, read_only=True)
    
    def get_patient_details(self, obj):
        """Get patient details including age and gender."""
        if obj.patient:
            return {
                'id': obj.patient.id,
                'name': obj.patient.get_full_name(),
                'age': getattr(obj.patient, 'age', None),
                'gender': getattr(obj.patient, 'gender', None),
            }
        return None
    
    def get_doctor_details(self, obj):
        """Get doctor details including specialty."""
        if obj.doctor:
            return {
                'id': obj.doctor.id,
                'name': obj.doctor.get_full_name(),
                'specialty': getattr(obj.doctor, 'specialty', None),
            }
        return None
    
    class Meta:
        model = RadiologyOrder
        fields = '__all__'
        read_only_fields = ['order_id', 'ordered_at', 'created_at']


class RadiologyReportSerializer(serializers.ModelSerializer):
    """Serializer for RadiologyReport model."""
    
    study_details = RadiologyStudySerializer(source='study', read_only=True)
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_details = serializers.SerializerMethodField()
    order_id = serializers.CharField(source='order.order_id', read_only=True)
    order_details = serializers.SerializerMethodField()
    
    def get_patient_details(self, obj):
        """Get patient details including age and gender."""
        if obj.patient:
            return {
                'id': obj.patient.id,
                'name': obj.patient.get_full_name(),
                'age': getattr(obj.patient, 'age', None),
                'gender': getattr(obj.patient, 'gender', None),
            }
        return None
    
    def get_order_details(self, obj):
        """Get order details including doctor information."""
        if obj.order:
            return {
                'id': obj.order.id,
                'order_id': obj.order.order_id,
                'doctor': obj.order.doctor.id if obj.order.doctor else None,
                'doctor_name': obj.order.doctor.get_full_name() if obj.order.doctor else None,
                'doctor_specialty': getattr(obj.order.doctor, 'specialty', None) if obj.order.doctor else None,
                'clinic': obj.order.clinic,
                'clinical_notes': obj.order.clinical_notes,
            }
        return None
    
    class Meta:
        model = RadiologyReport
        fields = '__all__'
        read_only_fields = ['created_at']

