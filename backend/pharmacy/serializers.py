"""
Serializers for the Pharmacy app.
"""
from rest_framework import serializers
from .models import GenericMedication, Medication, MedicationInventory, Prescription, PrescriptionItem, Dispense, StockRequest, StockRequestItem, StockIssue, StockIssueLine


class GenericMedicationSerializer(serializers.ModelSerializer):
    """Serializer for GenericMedication model."""

    def validate_atc_code(self, value):
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    class Meta:
        model = GenericMedication
        fields = '__all__'


class MedicationSerializer(serializers.ModelSerializer):
    """Serializer for Medication model."""
    
    generic = GenericMedicationSerializer(read_only=True)
    generic_id = serializers.PrimaryKeyRelatedField(
        queryset=GenericMedication.objects.all(),
        source='generic',
        write_only=True,
        required=False
    )

    def validate(self, attrs):
        generic = attrs.get('generic') or getattr(self.instance, 'generic', None)
        if not generic and not self.instance:
            raise serializers.ValidationError({'detail': 'generic_id is required for brand medications'})
        # Enforce unique brand per generic gracefully
        name = attrs.get('name') or (self.instance and self.instance.name)
        if name and generic:
            qs = Medication.objects.filter(name=name, generic=generic)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({'detail': 'Brand name must be unique per generic.'})
        # Enforce unique code gracefully
        code = attrs.get('code') or (self.instance and self.instance.code)
        if code:
            qs_code = Medication.objects.filter(code=code)
            if self.instance:
                qs_code = qs_code.exclude(pk=self.instance.pk)
            if qs_code.exists():
                raise serializers.ValidationError({'detail': 'Medication code must be unique.'})
        return attrs

    class Meta:
        model = Medication
        fields = [
            'id', 'name', 'generic', 'generic_id', 'code', 'unit',
            'strength', 'form',
            'category', 'manufacturer', 'pack_size', 'min_stock_level', 'prescription_required', 'description',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class MedicationInventorySerializer(serializers.ModelSerializer):
    """Serializer for MedicationInventory model."""
    
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    is_low_stock = serializers.ReadOnlyField()
    is_expired = serializers.ReadOnlyField()
    medication = MedicationSerializer(read_only=True)
    
    class Meta:
        model = MedicationInventory
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class PrescriptionItemSerializer(serializers.ModelSerializer):
    """Serializer for PrescriptionItem model."""
    
    medication_name = serializers.SerializerMethodField()
    medication_code = serializers.SerializerMethodField()
    medication_details = serializers.SerializerMethodField()
    prescription = serializers.PrimaryKeyRelatedField(read_only=True)  # Make prescription read-only for nested writes
    
    generic = serializers.PrimaryKeyRelatedField(
        queryset=GenericMedication.objects.all(),
        required=True
    )
    medication = serializers.PrimaryKeyRelatedField(
        queryset=Medication.objects.all(),
        required=False,
        allow_null=True
    )

    def validate(self, attrs):
        generic = attrs.get('generic') or getattr(self.instance, 'generic', None)
        medication = attrs.get('medication') if 'medication' in attrs else getattr(self.instance, 'medication', None)

        # Generic is required
        if not generic:
            raise serializers.ValidationError("Generic medication is required.")

        # If a brand medication is provided, it must belong to the selected generic
        if medication and medication.generic_id != generic.id:
            raise serializers.ValidationError({
                'medication': 'Selected brand does not belong to selected generic.'
            })

        # Auto-fill metadata from selected medication/generic when omitted
        def _is_blank(value):
            return value is None or (isinstance(value, str) and not value.strip())

        if _is_blank(attrs.get('unit')):
            attrs['unit'] = getattr(medication, 'unit', None) or getattr(generic, 'dosage_form', None) or 'unit'
        if _is_blank(attrs.get('dosage_form')):
            attrs['dosage_form'] = getattr(medication, 'form', None) or getattr(generic, 'dosage_form', None) or ''
        if _is_blank(attrs.get('strength')):
            attrs['strength'] = getattr(medication, 'strength', None) or getattr(generic, 'strength', None) or ''
        if _is_blank(attrs.get('route')):
            attrs['route'] = getattr(generic, 'route', None) or ''

        return attrs

    def get_medication_name(self, obj):
        """Get medication name safely (Brand or Generic)."""
        try:
            if obj.medication:
                return obj.medication.name
            if obj.generic:
                return obj.generic.name
            return None
        except (AttributeError, TypeError):
            return None

    def get_medication_code(self, obj):
        """Get medication code safely."""
        try:
            if obj.medication:
                return obj.medication.code
            # Generics don't have a stock code, but maybe ATC?
            if obj.generic:
                return obj.generic.atc_code
            return None
        except (AttributeError, TypeError):
            return None

    def get_medication_details(self, obj):
        """Get medication details including current stock."""
        try:
            if obj.medication:
                medication = obj.medication
                # Calculate total available stock from inventory
                from .models import MedicationInventory
                from django.db.models import Sum
                from django.utils import timezone
                
                total_stock = MedicationInventory.objects.filter(
                    medication=medication,
                    expiry_date__gt=timezone.now().date()
                ).aggregate(total=Sum('quantity'))['total'] or 0
                
                return {
                    'id': getattr(medication, 'id', None),
                    'name': getattr(medication, 'name', None),
                    'code': getattr(medication, 'code', None),
                    'current_stock': float(total_stock),
                    'unit': getattr(medication, 'unit', None),
                    'strength': getattr(medication, 'strength', None),
                    'form': getattr(medication, 'form', None),
                    'type': 'brand',
                    'medication_id': getattr(medication, 'id', None)  # Include medication_id for reference
                }
            elif obj.generic:
                generic = obj.generic
                return {
                    'id': generic.id,
                    'name': generic.name,
                    'code': generic.atc_code,
                    'unit': generic.dosage_form, # Approximate
                    'strength': generic.strength,
                    'form': generic.dosage_form,
                    'type': 'generic',
                    'generic_id': generic.id  # Include generic_id for frontend detection
                }
            return None
        except (AttributeError, TypeError, ValueError):
            return None
    
    class Meta:
        model = PrescriptionItem
        fields = [
            'id', 'prescription', 'medication', 'generic', 'medication_name', 'medication_code',
            'medication_details', 'quantity', 'unit', 'dosage_form', 'strength', 'dosage', 'frequency', 'duration', 'route',
            'instructions', 'dispensed_quantity', 'is_dispensed',
        ]
        read_only_fields = ['prescription']


class PrescriptionSerializer(serializers.ModelSerializer):
    """Serializer for Prescription model."""

    patient_name = serializers.SerializerMethodField()
    patient_details = serializers.SerializerMethodField()
    visit_details = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    medications = PrescriptionItemSerializer(many=True, read_only=True)
    # Allow medications to be written during creation
    items = PrescriptionItemSerializer(many=True, write_only=True, required=False)

    def get_patient_name(self, obj):
        """Get patient full name."""
        return obj.patient.get_full_name() if obj.patient else "Unknown Patient"

    def get_patient_details(self, obj):
        """Get detailed patient information."""
        if not obj.patient:
            return {
                'id': None,
                'name': 'Unknown Patient',
                'patient_id': 'N/A',
                'age': None,
                'date_of_birth': None,
                'gender': 'Unknown',
                'phone': None,
                'phone_number': None,
                'allergies': []
            }

        patient = obj.patient

        # Parse allergies from text field (comma or newline separated)
        allergies_text = patient.allergies or ""
        allergies_list = [a.strip() for a in allergies_text.replace('\n', ',').split(',') if a.strip()]

        return {
            'id': patient.id,
            'name': patient.get_full_name(),
            'patient_id': patient.patient_id,
            'age': patient.age,
            'date_of_birth': patient.date_of_birth,
            'gender': patient.gender,
            'phone': patient.phone,
            'phone_number': patient.phone,  # Alias for compatibility
            'allergies': allergies_list,
        }

    def get_visit_details(self, obj):
        """Get visit details including clinic and location."""
        if not obj.visit:
            return None

        visit = obj.visit
        return {
            'id': visit.id,
            'visit_id': visit.visit_id,
            'clinic': visit.clinic,
            'location': visit.location,
            'visit_date': visit.created_at.date() if visit.created_at else None,
        }

    def get_doctor_name(self, obj):
        """Get doctor full name."""
        return obj.doctor.get_full_name() if obj.doctor else None
    
    def create(self, validated_data):
        """Create prescription with nested items."""
        items_data = validated_data.pop('items', [])
        prescription = Prescription.objects.create(**validated_data)
        
        # Create prescription items
        for item_data in items_data:
            PrescriptionItem.objects.create(prescription=prescription, **item_data)
        
        return prescription
    
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


class StockRequestItemSerializer(serializers.ModelSerializer):
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    
    class Meta:
        model = StockRequestItem
        fields = '__all__'
        read_only_fields = ['request']


class StockRequestSerializer(serializers.ModelSerializer):
    items = StockRequestItemSerializer(many=True)
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    confirmed_by_name = serializers.CharField(source='confirmed_by.get_full_name', read_only=True)
    
    class Meta:
        model = StockRequest
        fields = '__all__'
        read_only_fields = ['request_id', 'created_at', 'updated_at', 'requested_by']

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        # Assign requester from context if available
        if 'request' in self.context and self.context['request'].user.is_authenticated:
            validated_data['requested_by'] = self.context['request'].user
            
        request = StockRequest.objects.create(**validated_data)
        for item_data in items_data:
            StockRequestItem.objects.create(request=request, **item_data)
        return request


class StockIssueLineSerializer(serializers.ModelSerializer):
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    
    class Meta:
        model = StockIssueLine
        fields = '__all__'


class StockIssueSerializer(serializers.ModelSerializer):
    lines = StockIssueLineSerializer(many=True, read_only=True)
    issued_by_name = serializers.CharField(source='issued_by.get_full_name', read_only=True)
    
    class Meta:
        model = StockIssue
        fields = '__all__'
        read_only_fields = ['issue_id', 'issued_at', 'issued_by']
