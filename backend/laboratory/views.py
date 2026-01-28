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
from .pagination import FlexiblePageNumberPagination
from audit.services import AuditService


class LabTemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for managing lab templates."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = LabTemplateSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['sample_type', 'is_active']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'code']
    ordering = ['name']
    pagination_class = FlexiblePageNumberPagination  # Allow large page sizes
    
    def get_queryset(self):
        # Return all templates (not just active) to allow status management
        return LabTemplate.objects.all()


class LabOrderViewSet(viewsets.ModelViewSet):
    """ViewSet for managing lab orders."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = LabOrderSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'doctor', 'priority', 'consultation_session', 'visit']
    search_fields = ['order_id', 'clinical_notes']
    ordering_fields = ['ordered_at']
    ordering = ['-ordered_at']
    
    def get_queryset(self):
        return LabOrder.objects.all().select_related('patient', 'doctor', 'visit', 'consultation_session', 'created_by').prefetch_related('tests')
    
    def perform_create(self, serializer):
        # Set the doctor field using multiple fallback strategies
        data = serializer.validated_data.copy()
        if 'doctor' not in data or data['doctor'] is None:
            doctor = self._find_doctor_for_order(data)
            if doctor:
                data['doctor'] = doctor

        order = serializer.save(created_by=self.request.user, **data)

    def _find_doctor_for_order(self, data):
        """Find appropriate doctor for lab order using multiple strategies."""
        from accounts.models import User

        # Strategy 1: Check if consultation session exists and has a doctor
        if 'consultation_session' in data and data['consultation_session']:
            consultation = data['consultation_session']
            if hasattr(consultation, 'doctor') and consultation.doctor:
                return consultation.doctor

        # Strategy 2: Check if requesting user is a doctor
        user = self.request.user
        if hasattr(user, 'system_role') and user.system_role == 'Medical Doctor':
            return user

        # Strategy 3: Check if the created_by user (if different) is a doctor
        # This handles cases where orders are created programmatically

        # Strategy 4: For visits, check if the visit has a doctor assigned
        if 'visit' in data and data['visit']:
            visit = data['visit']
            if hasattr(visit, 'doctor') and visit.doctor:
                return visit.doctor

        # Strategy 5: Find any available doctor as last resort
        # This ensures orders always have a doctor assigned
        try:
            doctor = User.objects.filter(system_role='Medical Doctor').first()
            if doctor:
                return doctor
        except:
            pass

        return None

        # Log audit
        doctor_name = order.doctor.get_full_name() if order.doctor else 'Unknown'
        AuditService.log_lab_action(
            user=self.request.user,
            action='create',
            lab_order=order,
            module='laboratory',
            description=f'Created lab order {order.order_id} for patient {order.patient.get_full_name()} by Dr. {doctor_name}',
            request=self.request,
        )
    
    @action(detail=True, methods=['post'])
    def generate_lab_number(self, request, pk=None):
        """Generate Lab ID (BT-YY-NNNN) for a test. Used when patient comes to lab and sample is collected.
        One Lab ID per order: all tests in the order share the same Lab ID when collected together."""
        from django.db.models import Max

        order = self.get_object()
        test_id = request.data.get('test_id')

        try:
            test = order.tests.get(id=test_id)

            if not test.lab_number:
                # Format: BT-YY-NNNN (BT = Bode Thomas, YY = year, NNNN = serial)
                current_year = timezone.now().year % 100
                clinic_code = 'BT'
                year_prefix = f"{clinic_code}-{current_year:02d}-"
                max_lab_number = LabTest.objects.filter(
                    lab_number__startswith=year_prefix
                ).aggregate(Max('lab_number'))['lab_number__max']

                if max_lab_number:
                    try:
                        serial = int(max_lab_number.split('-')[-1]) + 1
                    except (ValueError, IndexError):
                        serial = 1
                else:
                    serial = 1

                test.lab_number = f"{clinic_code}-{current_year:02d}-{serial:04d}"
                test.save()

                AuditService.log_activity(
                    user=request.user,
                    action='update',
                    object_type='lab_test',
                    object_id=str(test.id),
                    module='laboratory',
                    object_repr=f'Lab Test {test.template.name if test.template else "Unknown"}',
                    description=f'Lab ID generated: {test.lab_number} (Order: {order.order_id})',
                    old_values={},
                    new_values={'lab_number': test.lab_number},
                    metadata={'order_id': order.order_id},
                    request=request,
                )

            return Response(LabTestSerializer(test).data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def collect_samples(self, request, pk=None):
        """Collect samples for multiple tests in the order. Generates ONE Lab ID (BT-YY-NNNN) and
        assigns it to all tests in the order. When a patient comes to the lab, one Lab ID covers
        all tests in that order."""
        from django.db.models import Max

        order = self.get_object()
        test_ids = request.data.get('test_ids', [])
        collection_method = request.data.get('collection_method', '')
        notes = request.data.get('notes', '')

        if not test_ids:
            return Response({'error': 'No tests specified'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tests = order.tests.filter(id__in=test_ids)

            # One Lab ID (BT-YY-NNNN) for this collection – shared by all tests
            current_year = timezone.now().year % 100
            clinic_code = 'BT'
            year_prefix = f"{clinic_code}-{current_year:02d}-"
            max_lab_number = LabTest.objects.filter(
                lab_number__startswith=year_prefix
            ).aggregate(Max('lab_number'))['lab_number__max']

            if max_lab_number:
                try:
                    next_serial = int(max_lab_number.split('-')[-1]) + 1
                except (ValueError, IndexError):
                    next_serial = 1
            else:
                next_serial = 1

            shared_lab_number = f"{clinic_code}-{current_year:02d}-{next_serial:04d}"

            updated_tests = []
            for test in tests:
                test.lab_number = shared_lab_number
                test.status = 'sample_collected'
                test.collected_by = request.user
                test.collected_at = timezone.now()

                # Store collection method and notes
                collection_info = []
                if test.lab_number:
                    collection_info.append(f"Lab ID: {test.lab_number}")
                if collection_method:
                    collection_info.append(f"Method: {collection_method}")
                if notes:
                    collection_info.append(f"Notes: {notes}")
                if collection_info:
                    test.notes = '\n'.join(collection_info)

                test.save()

                # Log audit
                AuditService.log_activity(
                    user=request.user,
                    action='update',
                    object_type='lab_test',
                    object_id=str(test.id),
                    module='laboratory',
                    object_repr=f'Lab Test {test.template.name if test.template else "Unknown"}',
                    description=f'Sample collected for test: {test.template.name if test.template else "Unknown"} (Order: {order.order_id})',
                    old_values={'status': 'pending'},
                    new_values={'status': 'sample_collected'},
                    metadata={'order_id': order.order_id, 'collection_method': collection_method, 'lab_number': test.lab_number},
                    request=request,
                )

                updated_tests.append(test)

            return Response(LabTestSerializer(updated_tests, many=True).data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
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
            
            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='lab_test',
                object_id=str(test.id),
                module='laboratory',
                object_repr=f'Lab Test {test.template.name if test.template else "Unknown"}',
                description=f'Test marked as processing: {test.template.name if test.template else "Unknown"} (Order: {order.order_id})',
                old_values={'status': 'sample_collected'},
                new_values={'status': 'processing', 'processing_method': processing_method},
                metadata={'order_id': order.order_id, 'outsourced_lab': outsourced_lab if processing_method == 'outsourced' else ''},
                request=self.request,
            )
            
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
            
            # Check if this was a rejected test being resubmitted
            was_rejected = test.status == 'rejected' or test.rejected_by is not None
            
            test.results = results
            test.notes = notes
            if result_file:
                test.result_file = result_file
            test.status = 'results_ready'
            
            # If this was a rejected test being resubmitted, clear rejection fields
            if was_rejected:
                test.rejected_by = None
                test.rejected_at = None
                # Clear verification_notes if it contains rejection reason (starts with "REJECTED:")
                if test.verification_notes and test.verification_notes.startswith('REJECTED:'):
                    test.verification_notes = ''
            
            test.save()
            
            # Create or update result record for verification
            LabResult.objects.update_or_create(
                test=test,
                defaults={
                    'order': order,
                    'patient': order.patient,
                }
            )
            
            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='lab_test',
                object_id=str(test.id),
                module='laboratory',
                object_repr=f'Lab Test {test.template.name if test.template else "Unknown"}',
                description=f'Results submitted for test: {test.template.name if test.template else "Unknown"} (Order: {order.order_id})',
                old_values={'status': 'processing'},
                new_values={'status': 'results_ready'},
                metadata={'order_id': order.order_id, 'results_count': len(results) if isinstance(results, dict) else 0},
                request=self.request,
            )
            
            return Response(LabTestSerializer(test).data)
        except LabTest.DoesNotExist:
            return Response({'error': 'Test not found'}, status=status.HTTP_404_NOT_FOUND)


class LabTestViewSet(viewsets.ModelViewSet):
    """ViewSet for managing lab tests."""

    permission_classes = [IsAuthenticated]
    serializer_class = LabTestSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['order', 'status', 'processing_method', 'order__patient']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = LabTest.objects.all().select_related('order', 'template', 'collected_by', 'processed_by', 'verified_by', 'rejected_by')

        # Filter by status if provided
        status_filter = self.request.query_params.get('status', None)
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filter by patient if provided (goes through order relationship)
        patient_filter = self.request.query_params.get('patient', None)
        if patient_filter:
            queryset = queryset.filter(order__patient=patient_filter)

        return queryset
    
    def perform_update(self, serializer):
        """Handle status changes, especially rejection."""
        instance = serializer.instance
        old_status = instance.status
        
        # Check if status is being changed to 'rejected'
        if 'status' in serializer.validated_data:
            new_status = serializer.validated_data['status']
            
            if new_status == 'rejected' and instance.status != 'rejected':
                # Set rejection tracking fields
                test = serializer.save(
                    rejected_by=self.request.user,
                    rejected_at=timezone.now()
                )
                
                # Log audit for rejection
                AuditService.log_activity(
                    user=self.request.user,
                    action='reject',
                    object_type='lab_test',
                    object_id=str(test.id),
                    module='laboratory',
                    object_repr=f'Lab Test {test.template.name if test.template else "Unknown"}',
                    description=f'Rejected test: {test.template.name if test.template else "Unknown"}',
                    old_values={'status': old_status},
                    new_values={'status': 'rejected'},
                    request=self.request,
                )
            else:
                # For other status changes, save normally
                test = serializer.save()
                
                # Log audit for other status changes
                if old_status != new_status:
                    AuditService.log_activity(
                        user=self.request.user,
                        action='update',
                        object_type='lab_test',
                        object_id=str(test.id),
                        module='laboratory',
                        object_repr=f'Lab Test {test.template.name if test.template else "Unknown"}',
                        description=f'Updated test status: {test.template.name if test.template else "Unknown"}',
                        old_values={'status': old_status},
                        new_values={'status': new_status},
                        request=self.request,
                    )
        else:
            # No status change, save normally
            serializer.save()


class LabResultViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing lab results awaiting verification."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = LabResultSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['patient', 'overall_status', 'priority']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        # Filter by status if provided, default to 'results_ready' for pending verifications
        status_filter = self.request.query_params.get('status', 'results_ready')

        queryset = LabResult.objects.select_related('test', 'order', 'order__patient', 'order__doctor', 'patient')

        if status_filter == 'results_ready':
            # Only show results that are ready for verification (exclude rejected)
            queryset = queryset.filter(test__status='results_ready')
        elif status_filter == 'verified':
            # Show verified results
            queryset = queryset.filter(test__status='verified')
        elif status_filter == 'all':
            # Show all results (both pending and verified)
            queryset = queryset.filter(test__status__in=['results_ready', 'verified'])

        return queryset
    
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
        
        # Log audit
        AuditService.log_activity(
            user=request.user,
            action='verify',
            object_type='lab_result',
            object_id=str(result.id),
            module='laboratory',
            object_repr=f'Lab Result for {test.template.name if test.template else "Unknown"}',
            description=f'Verified lab result: {test.template.name if test.template else "Unknown"} (Order: {result.order.order_id})',
            old_values={'test_status': 'results_ready'},
            new_values={'test_status': 'verified', 'overall_status': result.overall_status},
            metadata={'order_id': result.order.order_id, 'verification_notes': test.verification_notes},
            request=request,
        )
        
        return Response(LabResultSerializer(result).data)

