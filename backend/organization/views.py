"""
Views for the Organization app.
"""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Clinic, Department, Room
from .serializers import ClinicSerializer, DepartmentSerializer, RoomSerializer
from audit.services import AuditService


class ClinicViewSet(viewsets.ModelViewSet):
    """ViewSet for managing clinics."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ClinicSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'code', 'location']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_queryset(self):
        return Clinic.objects.all()
    
    def perform_create(self, serializer):
        """Create clinic and log audit."""
        clinic = serializer.save()
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='clinic',
            object_id=str(clinic.id),
            module='administration',
            object_repr=clinic.name,
            description=f'Created clinic: {clinic.name}',
            new_values={'name': clinic.name, 'code': clinic.code, 'is_active': clinic.is_active},
            request=self.request,
        )
    
    def perform_update(self, serializer):
        """Update clinic and log audit."""
        old_instance = self.get_object()
        old_values = {'name': old_instance.name, 'code': old_instance.code, 'is_active': old_instance.is_active}
        clinic = serializer.save()
        new_values = {'name': clinic.name, 'code': clinic.code, 'is_active': clinic.is_active}
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='clinic',
            object_id=str(clinic.id),
            module='administration',
            object_repr=clinic.name,
            description=f'Updated clinic: {clinic.name}',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )
    
    def perform_destroy(self, instance):
        """Delete clinic and log audit."""
        clinic_id = instance.id
        clinic_name = instance.name
        AuditService.log_activity(
            user=self.request.user,
            action='delete',
            object_type='clinic',
            object_id=str(clinic_id),
            module='administration',
            object_repr=clinic_name,
            description=f'Deleted clinic: {clinic_name}',
            old_values={'name': clinic_name},
            request=self.request,
        )
        instance.delete()


class DepartmentViewSet(viewsets.ModelViewSet):
    """ViewSet for managing departments."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = DepartmentSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['clinic', 'is_active']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_queryset(self):
        return Department.objects.all().select_related('clinic', 'head')
    
    def perform_create(self, serializer):
        """Create department and log audit."""
        department = serializer.save()
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='department',
            object_id=str(department.id),
            module='administration',
            object_repr=department.name,
            description=f'Created department: {department.name}',
            new_values={'name': department.name, 'code': department.code, 'clinic_id': str(department.clinic.id) if department.clinic else None, 'is_active': department.is_active},
            request=self.request,
        )
    
    def perform_update(self, serializer):
        """Update department and log audit."""
        old_instance = self.get_object()
        old_values = {'name': old_instance.name, 'code': old_instance.code, 'is_active': old_instance.is_active}
        department = serializer.save()
        new_values = {'name': department.name, 'code': department.code, 'is_active': department.is_active}
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='department',
            object_id=str(department.id),
            module='administration',
            object_repr=department.name,
            description=f'Updated department: {department.name}',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )
    
    def perform_destroy(self, instance):
        """Delete department and log audit."""
        dept_id = instance.id
        dept_name = instance.name
        AuditService.log_activity(
            user=self.request.user,
            action='delete',
            object_type='department',
            object_id=str(dept_id),
            module='administration',
            object_repr=dept_name,
            description=f'Deleted department: {dept_name}',
            old_values={'name': dept_name},
            request=self.request,
        )
        instance.delete()


class RoomViewSet(viewsets.ModelViewSet):
    """ViewSet for managing rooms."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = RoomSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['clinic', 'department', 'room_type', 'status', 'is_active']
    search_fields = ['name', 'room_number', 'location']
    ordering_fields = ['room_number', 'name']
    ordering = ['room_number']
    
    def get_queryset(self):
        return Room.objects.all().select_related('clinic', 'department')
    
    def perform_create(self, serializer):
        """Create room and log audit."""
        room = serializer.save()
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='room',
            object_id=str(room.id),
            module='administration',
            object_repr=room.name or room.room_number,
            description=f'Created room: {room.name or room.room_number}',
            new_values={'name': room.name, 'room_number': room.room_number, 'room_type': room.room_type, 'status': room.status, 'is_active': room.is_active},
            request=self.request,
        )
    
    def perform_update(self, serializer):
        """Update room and log audit."""
        old_instance = self.get_object()
        old_values = {'name': old_instance.name, 'status': old_instance.status, 'is_active': old_instance.is_active}
        room = serializer.save()
        new_values = {'name': room.name, 'status': room.status, 'is_active': room.is_active}
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='room',
            object_id=str(room.id),
            module='administration',
            object_repr=room.name or room.room_number,
            description=f'Updated room: {room.name or room.room_number}',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )
    
    def perform_destroy(self, instance):
        """Delete room and log audit."""
        room_id = instance.id
        room_name = instance.name or instance.room_number
        AuditService.log_activity(
            user=self.request.user,
            action='delete',
            object_type='room',
            object_id=str(room_id),
            module='administration',
            object_repr=room_name,
            description=f'Deleted room: {room_name}',
            old_values={'name': room_name},
            request=self.request,
        )
        instance.delete()

