"""
Serializers for the Pharmacy app.
"""
from rest_framework import serializers
from .models import Medication, MedicationInventory, Prescription, PrescriptionItem, Dispense


class MedicationSerializer(serializers.ModelSerializer):
    """Serializer for Medication model."""
    
    class Meta:
        model = Medication
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class MedicationInventorySerializer(serializers.ModelSerializer):
    """Serializer for MedicationInventory model."""
    
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    is_low_stock = serializers.ReadOnlyField()
    is_expired = serializers.ReadOnlyField()
    
    class Meta:
        model = MedicationInventory
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class PrescriptionItemSerializer(serializers.ModelSerializer):
    """Serializer for PrescriptionItem model."""
    
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    medication_code = serializers.CharField(source='medication.code', read_only=True)
    
    class Meta:
        model = PrescriptionItem
        fields = '__all__'


class PrescriptionSerializer(serializers.ModelSerializer):
    """Serializer for Prescription model."""
    
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    medications = PrescriptionItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = Prescription
        fields = '__all__'
        read_only_fields = ['prescription_id', 'prescribed_at', 'created_at']


class DispenseSerializer(serializers.ModelSerializer):
    """Serializer for Dispense model."""
    
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    patient_name = serializers.CharField(source='prescription.patient.get_full_name', read_only=True)
    dispensed_by_name = serializers.CharField(source='dispensed_by.get_full_name', read_only=True, allow_null=True)
    
    class Meta:
        model = Dispense
        fields = '__all__'
        read_only_fields = ['dispense_id', 'dispensed_at']

