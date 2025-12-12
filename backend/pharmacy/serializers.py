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
    medication_details = serializers.SerializerMethodField()
    
    def get_medication_details(self, obj):
        """Get medication details including current stock."""
        if not obj.medication:
            return None
        
        # Calculate total available stock from inventory
        from .models import MedicationInventory
        from django.db.models import Sum
        from django.utils import timezone
        
        total_stock = MedicationInventory.objects.filter(
            medication=obj.medication,
            expiry_date__gt=timezone.now().date()
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        return {
            'id': obj.medication.id,
            'name': obj.medication.name,
            'code': obj.medication.code,
            'current_stock': float(total_stock),
            'unit': obj.medication.unit,
            'strength': obj.medication.strength,
            'form': obj.medication.form,
        }
    
    class Meta:
        model = PrescriptionItem
        fields = '__all__'


class PrescriptionSerializer(serializers.ModelSerializer):
    """Serializer for Prescription model."""
    
    patient_name = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    medications = PrescriptionItemSerializer(many=True, read_only=True)
    
    def get_patient_name(self, obj):
        """Get patient full name."""
        return obj.patient.get_full_name() if obj.patient else None
    
    def get_doctor_name(self, obj):
        """Get doctor full name."""
        return obj.doctor.get_full_name() if obj.doctor else None
    
    class Meta:
        model = Prescription
        fields = '__all__'
        read_only_fields = ['prescription_id', 'prescribed_at', 'created_at']


class DispenseSerializer(serializers.ModelSerializer):
    """Serializer for Dispense model."""
    
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    patient_name = serializers.CharField(source='prescription.patient.get_full_name', read_only=True)
    dispensed_by_name = serializers.CharField(source='dispensed_by.get_full_name', read_only=True, allow_null=True)
    prescription_details = PrescriptionSerializer(source='prescription', read_only=True)
    
    class Meta:
        model = Dispense
        fields = '__all__'
        read_only_fields = ['dispense_id', 'dispensed_at']

