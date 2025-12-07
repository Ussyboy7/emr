"""
Views for the Organization app.
"""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Clinic, Department, Room
from .serializers import ClinicSerializer, DepartmentSerializer, RoomSerializer


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

