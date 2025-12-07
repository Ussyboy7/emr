"""
Views for the Patients app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.shortcuts import get_object_or_404

from .models import Patient, Visit, VitalReading, MedicalHistory
from .serializers import (
    PatientSerializer,
    PatientListSerializer,
    VisitSerializer,
    VitalReadingSerializer,
    MedicalHistorySerializer,
)


class PatientViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing patients.
    
    list: Get a list of all patients (lightweight serializer)
    retrieve: Get detailed patient information
    create: Register a new patient
    update: Update patient information
    partial_update: Partially update patient information
    destroy: Soft delete a patient (set is_active=False)
    """
    
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'gender', 'blood_group', 'is_active']
    search_fields = ['patient_id', 'surname', 'first_name', 'middle_name', 'personal_number', 'phone', 'email']
    ordering_fields = ['created_at', 'surname', 'first_name']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Return queryset filtered by active patients by default."""
        queryset = Patient.objects.all()
        # Filter by active status if not explicitly requested
        if self.request.query_params.get('include_inactive') != 'true':
            queryset = queryset.filter(is_active=True)
        return queryset.select_related('principal_staff', 'created_by')
    
    def get_serializer_class(self):
        """Use lightweight serializer for list, full serializer for detail."""
        if self.action == 'list':
            return PatientListSerializer
        return PatientSerializer
    
    def perform_create(self, serializer):
        """Set created_by when creating a patient."""
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['get'])
    def visits(self, request, pk=None):
        """Get all visits for a patient."""
        patient = self.get_object()
        visits = patient.visits.all().order_by('-date', '-time')
        serializer = VisitSerializer(visits, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def vitals(self, request, pk=None):
        """Get all vital readings for a patient."""
        patient = self.get_object()
        vitals = patient.vital_readings.all().order_by('-recorded_at')
        serializer = VitalReadingSerializer(vitals, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Get medical history for a patient."""
        patient = self.get_object()
        history, created = MedicalHistory.objects.get_or_create(patient=patient)
        serializer = MedicalHistorySerializer(history)
        return Response(serializer.data)
    
    @action(detail=True, methods=['patch'])
    def update_history(self, request, pk=None):
        """Update medical history for a patient."""
        patient = self.get_object()
        history, created = MedicalHistory.objects.get_or_create(patient=patient)
        serializer = MedicalHistorySerializer(history, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by=request.user)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class VisitViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing patient visits.
    """
    
    permission_classes = [IsAuthenticated]
    serializer_class = VisitSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'status', 'visit_type', 'clinic']
    search_fields = ['visit_id', 'chief_complaint', 'clinical_notes']
    ordering_fields = ['date', 'time', 'created_at']
    ordering = ['-date', '-time']
    
    def get_queryset(self):
        return Visit.objects.all().select_related('patient', 'doctor', 'created_by')
    
    def perform_create(self, serializer):
        """Set created_by when creating a visit."""
        serializer.save(created_by=self.request.user)


class VitalReadingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing vital readings.
    """
    
    permission_classes = [IsAuthenticated]
    serializer_class = VitalReadingSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['patient', 'visit']
    ordering_fields = ['recorded_at']
    ordering = ['-recorded_at']
    
    def get_queryset(self):
        return VitalReading.objects.all().select_related('patient', 'visit', 'recorded_by')
    
    def perform_create(self, serializer):
        """Set recorded_by when creating a vital reading."""
        serializer.save(recorded_by=self.request.user)

