"""
Serializers for the Organization app.
"""
from rest_framework import serializers
from .models import Clinic, Department, Room


class ClinicSerializer(serializers.ModelSerializer):
    """Serializer for Clinic model."""
    
    staff_count = serializers.SerializerMethodField()
    room_count = serializers.SerializerMethodField()
    head_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Clinic
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'staff_count', 'room_count', 'head_name']
    
    def get_staff_count(self, obj):
        """Get count of staff assigned to this clinic."""
        return obj.staff.filter(is_active=True).count()
    
    def get_room_count(self, obj):
        """Get count of rooms assigned to this clinic.
        Includes both organization.Room and consultation.ConsultationRoom.
        """
        from consultation.models import ConsultationRoom
        org_rooms_count = obj.rooms.filter(is_active=True).count()
        consult_rooms_count = ConsultationRoom.objects.filter(clinic=obj, is_active=True).count()
        return org_rooms_count + consult_rooms_count
    
    def get_head_name(self, obj):
        """Get the name of the clinic head (if any department head exists)."""
        # For now, return None as Clinic doesn't have a direct head field
        # Could be implemented if needed
        return None


class DepartmentSerializer(serializers.ModelSerializer):
    """Serializer for Department model."""
    
    clinic_name = serializers.CharField(source='clinic.name', read_only=True)
    head_name = serializers.CharField(source='head.get_full_name', read_only=True, allow_null=True)
    staff_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Department
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'staff_count']
    
    def get_staff_count(self, obj):
        """Get count of staff assigned to this department."""
        return obj.staff.filter(is_active=True).count()


class RoomSerializer(serializers.ModelSerializer):
    """Serializer for Room model."""
    
    clinic_name = serializers.CharField(source='clinic.name', read_only=True, allow_null=True)
    department_name = serializers.CharField(source='department.name', read_only=True, allow_null=True)
    
    class Meta:
        model = Room
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

