"""
Serializers for the Wards app.
"""
from rest_framework import serializers
from .models import Ward, Bed, PatientAdmission, WardAssignment


class WardSerializer(serializers.ModelSerializer):
    """Serializer for Ward model."""

    head_nurse_name = serializers.CharField(source='head_nurse.get_full_name', read_only=True)
    available_beds = serializers.ReadOnlyField()
    occupancy_rate = serializers.ReadOnlyField()
    beds_count = serializers.SerializerMethodField()

    class Meta:
        model = Ward
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'occupied_beds']

    def get_beds_count(self, obj):
        return obj.beds.count()


class BedSerializer(serializers.ModelSerializer):
    """Serializer for Bed model."""

    ward_name = serializers.CharField(source='ward.name', read_only=True)
    current_patient_name = serializers.CharField(source='current_patient.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = Bed
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class PatientAdmissionSerializer(serializers.ModelSerializer):
    """Serializer for PatientAdmission model."""

    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    ward_name = serializers.CharField(source='ward.name', read_only=True)
    bed_number = serializers.CharField(source='bed.bed_number', read_only=True, allow_null=True)
    admitting_doctor_name = serializers.CharField(source='admitting_doctor.get_full_name', read_only=True, allow_null=True)
    discharge_doctor_name = serializers.CharField(source='discharge_doctor.get_full_name', read_only=True, allow_null=True)
    length_of_stay = serializers.ReadOnlyField()
    is_active = serializers.ReadOnlyField()

    class Meta:
        model = PatientAdmission
        fields = '__all__'
        read_only_fields = ['admission_id', 'created_at', 'updated_at', 'created_by', 'discharge_date', 'ward_assignment']


class WardAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for WardAssignment model."""

    nurse_name = serializers.CharField(source='nurse.get_full_name', read_only=True)
    patient_name = serializers.CharField(source='admission.patient.get_full_name', read_only=True)
    ward_name = serializers.CharField(source='admission.ward.name', read_only=True)
    assigned_by_name = serializers.CharField(source='assigned_by.get_full_name', read_only=True, allow_null=True)
    is_active = serializers.ReadOnlyField()

    class Meta:
        model = WardAssignment
        fields = '__all__'
        read_only_fields = ['assigned_at', 'completed_at']