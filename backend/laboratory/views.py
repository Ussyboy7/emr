"""
Views for the Laboratory app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone

from .models import LabTemplate, LabOrder, LabTest, LabResult
from .serializers import (
    LabTemplateSerializer,
    LabOrderSerializer,
    LabTestSerializer,
    LabResultSerializer,
)


class LabTemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for managing lab templates."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = LabTemplateSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['sample_type', 'is_active']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'code']
    ordering = ['name']
    
    def get_queryset(self):
        return LabTemplate.objects.filter(is_active=True)


class LabOrderViewSet(viewsets.ModelViewSet):
    """ViewSet for managing lab orders."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = LabOrderSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'doctor', 'priority', 'status']
    search_fields = ['order_id', 'clinical_notes']
    ordering_fields = ['ordered_at']
    ordering = ['-ordered_at']
    
    def get_queryset(self):
        return LabOrder.objects.all().select_related('patient', 'doctor', 'visit', 'created_by').prefetch_related('tests')
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def collect_sample(self, request, pk=None):
        """Mark sample as collected for a test."""
        order = self.get_object()
        test_id = request.data.get('test_id')
        collection_method = request.data.get('collection_method', '')
        notes = request.data.get('notes', '')
        
        try:
            test = order.tests.get(id=test_id)
            test.status = 'sample_collected'
            test.collected_by = request.user
            test.collected_at = timezone.now()
            
            # Store collection method and notes
            collection_info = []
            if collection_method:
                collection_info.append(f"Method: {collection_method}")
            if notes:
                collection_info.append(f"Notes: {notes}")
            if collection_info:
                test.notes = '\n'.join(collection_info)
            
            test.save()
            return Response(LabTestSerializer(test).data)
        except LabTest.DoesNotExist:
            return Response({'error': 'Test not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Mark test as processing."""
        order = self.get_object()
        test_id = request.data.get('test_id')
        processing_method = request.data.get('processing_method')
        outsourced_lab = request.data.get('outsourced_lab', '')
        
        try:
            test = order.tests.get(id=test_id)
            test.status = 'processing'
            test.processing_method = processing_method
            test.outsourced_lab = outsourced_lab if processing_method == 'outsourced' else ''
            test.processed_by = request.user
            test.processed_at = timezone.now()
            test.save()
            return Response(LabTestSerializer(test).data)
        except LabTest.DoesNotExist:
            return Response({'error': 'Test not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=True, methods=['post'])
    def submit_results(self, request, pk=None):
        """Submit results for a test."""
        order = self.get_object()
        test_id = request.data.get('test_id')
        results = request.data.get('results', {})
        notes = request.data.get('notes', '')
        result_file = request.FILES.get('result_file')
        
        try:
            test = order.tests.get(id=test_id)
            test.results = results
            test.notes = notes
            if result_file:
                test.result_file = result_file
            test.status = 'results_ready'
            test.save()
            
            # Create result record for verification
            LabResult.objects.get_or_create(
                test=test,
                defaults={
                    'order': order,
                    'patient': order.patient,
                }
            )
            
            return Response(LabTestSerializer(test).data)
        except LabTest.DoesNotExist:
            return Response({'error': 'Test not found'}, status=status.HTTP_404_NOT_FOUND)


class LabTestViewSet(viewsets.ModelViewSet):
    """ViewSet for managing lab tests."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = LabTestSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['order', 'status', 'processing_method']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        queryset = LabTest.objects.all().select_related('order', 'template', 'collected_by', 'processed_by', 'verified_by')
        
        # Filter by status if provided
        status_filter = self.request.query_params.get('status', None)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset


class LabResultViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing lab results awaiting verification."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = LabResultSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['patient', 'overall_status', 'priority']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        # Only show results that are ready for verification
        return LabResult.objects.filter(
            test__status='results_ready'
        ).select_related('test', 'order', 'order__patient', 'order__doctor', 'patient')
    
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """Verify a lab result."""
        result = self.get_object()
        test = result.test
        
        test.status = 'verified'
        test.verified_by = request.user
        test.verified_at = timezone.now()
        test.verification_notes = request.data.get('notes', '')
        test.save()
        
        result.overall_status = request.data.get('overall_status', 'normal')
        result.priority = request.data.get('priority', 'medium')
        result.save()
        
        return Response(LabResultSerializer(result).data)

