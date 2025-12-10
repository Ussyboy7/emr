"""
Views for the Radiology app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone

from .models import RadiologyOrder, RadiologyStudy, RadiologyReport
from .serializers import (
    RadiologyOrderSerializer,
    RadiologyStudySerializer,
    RadiologyReportSerializer,
)


class RadiologyOrderViewSet(viewsets.ModelViewSet):
    """ViewSet for managing radiology orders."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = RadiologyOrderSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'doctor', 'priority']
    search_fields = ['order_id', 'clinical_notes']
    ordering_fields = ['ordered_at']
    ordering = ['-ordered_at']
    
    def get_queryset(self):
        return RadiologyOrder.objects.all().select_related('patient', 'doctor', 'visit', 'created_by').prefetch_related('studies')
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def schedule(self, request, pk=None):
        """Schedule a study."""
        order = self.get_object()
        study_id = request.data.get('study_id')
        scheduled_date = request.data.get('scheduled_date')
        scheduled_time = request.data.get('scheduled_time')
        
        try:
            study = order.studies.get(id=study_id)
            study.status = 'scheduled'
            study.scheduled_date = scheduled_date
            study.scheduled_time = scheduled_time
            study.scheduled_by = request.user
            study.save()
            return Response(RadiologyStudySerializer(study).data)
        except RadiologyStudy.DoesNotExist:
            return Response({'error': 'Study not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=True, methods=['post'])
    def acquire(self, request, pk=None):
        """Complete acquisition of a study."""
        order = self.get_object()
        study_id = request.data.get('study_id')
        processing_method = request.data.get('processing_method')
        outsourced_facility = request.data.get('outsourced_facility', '')
        images_count = request.data.get('images_count', 0)
        technical_notes = request.data.get('technical_notes', '')
        
        try:
            study = order.studies.get(id=study_id)
            # Status should be 'acquired' after image acquisition
            # It only becomes 'reported' after a radiologist creates the report
            study.status = 'acquired'
            study.processing_method = processing_method
            study.outsourced_facility = outsourced_facility if processing_method == 'outsourced' else ''
            study.images_count = images_count
            study.technical_notes = technical_notes
            study.acquired_by = request.user
            study.acquired_at = timezone.now()
            study.save()
            
            return Response(RadiologyStudySerializer(study).data)
        except RadiologyStudy.DoesNotExist:
            return Response({'error': 'Study not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=True, methods=['post'])
    def report(self, request, pk=None):
        """Create report for a study."""
        order = self.get_object()
        study_id = request.data.get('study_id')
        report = request.data.get('report', '')
        findings = request.data.get('findings', '')
        impression = request.data.get('impression', '')
        recommendations = request.data.get('recommendations', '')
        critical = request.data.get('critical', False) or request.data.get('critical') == 'true'
        report_file = request.FILES.get('report_file')
        
        try:
            study = order.studies.get(id=study_id)
            study.report = report
            study.findings = findings
            study.impression = impression
            study.recommendations = recommendations
            study.status = 'reported'
            study.reported_by = request.user
            study.reported_at = timezone.now()
            # Store critical flag if model supports it (could be added as a field)
            # For now, we'll note it in the report text if critical
            if critical:
                study.report = f"[CRITICAL FINDING]\n\n{study.report}"
            # File upload handling - could store file path if FileField added to model
            if report_file:
                # Note: FileField would need to be added to model for actual file storage
                study.technical_notes = f"{study.technical_notes}\n\nReport file uploaded: {report_file.name}".strip()
            study.save()
            
            # Create or update report record
            report_record, created = RadiologyReport.objects.get_or_create(
                study=study,
                defaults={
                    'order': order,
                    'patient': order.patient,
                    'overall_status': 'critical' if critical else 'normal',
                }
            )
            if not created:
                if critical:
                    report_record.overall_status = 'critical'
                report_record.save()
            
            return Response(RadiologyStudySerializer(study).data)
        except RadiologyStudy.DoesNotExist:
            return Response({'error': 'Study not found'}, status=status.HTTP_404_NOT_FOUND)


class RadiologyReportViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing radiology reports awaiting verification."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = RadiologyReportSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['patient', 'overall_status', 'priority']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        queryset = RadiologyReport.objects.all().select_related(
            'study', 'order', 'patient', 'order__doctor', 'study__reported_by'
        )
        
        # Filter by study status if provided
        study_status = self.request.query_params.get('study_status', None)
        if study_status:
            queryset = queryset.filter(study__status=study_status)
        else:
            # Default: only show reports that are ready for verification
            queryset = queryset.filter(study__status='reported')
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """Verify a radiology report."""
        report = self.get_object()
        study = report.study
        
        study.status = 'verified'
        study.verified_by = request.user
        study.verified_at = timezone.now()
        study.verification_notes = request.data.get('notes', '')
        study.save()
        
        report.overall_status = request.data.get('overall_status', 'normal')
        report.priority = request.data.get('priority', 'medium')
        report.save()
        
        return Response(RadiologyReportSerializer(report).data)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a radiology report and send back for revision."""
        report = self.get_object()
        study = report.study
        rejection_reason = request.data.get('reason', '')
        
        # Set study status back to 'acquired' so it can be re-reported
        study.status = 'acquired'
        study.verification_notes = f"Rejected: {rejection_reason}"
        study.verified_by = None
        study.verified_at = None
        # Clear previous report data to allow re-reporting
        study.report = ''
        study.findings = ''
        study.impression = ''
        study.recommendations = ''
        study.reported_by = None
        study.reported_at = None
        study.save()
        
        # Delete the report record so it's no longer in verification queue
        report.delete()
        
        return Response({
            'message': 'Report rejected and sent back for revision',
            'study': RadiologyStudySerializer(study).data
        })

