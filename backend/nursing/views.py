"""
Views for the Nursing app.
"""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import NursingOrder, Procedure
from .serializers import NursingOrderSerializer, ProcedureSerializer


class NursingOrderViewSet(viewsets.ModelViewSet):
    """ViewSet for managing nursing orders."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = NursingOrderSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'ordered_by', 'status', 'priority', 'order_type']
    search_fields = ['order_id', 'description']
    ordering_fields = ['ordered_at']
    ordering = ['-ordered_at']
    
    def get_queryset(self):
        return NursingOrder.objects.all().select_related('patient', 'ordered_by', 'visit', 'created_by')
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ProcedureViewSet(viewsets.ModelViewSet):
    """ViewSet for managing procedures."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ProcedureSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'procedure_type', 'performed_by']
    search_fields = ['procedure_id', 'description', 'notes']
    ordering_fields = ['performed_at']
    ordering = ['-performed_at']
    
    def get_queryset(self):
        return Procedure.objects.all().select_related('patient', 'nursing_order', 'visit', 'performed_by')
    
    def perform_create(self, serializer):
        serializer.save(performed_by=self.request.user)

