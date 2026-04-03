"""
Views for the Radiology app.
"""
import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone

from laboratory.pagination import FlexiblePageNumberPagination

from .models import RadiologyTemplate, RadiologyOrder, RadiologyStudy, RadiologyReport
from .serializers import (
    RadiologyTemplateSerializer,
    RadiologyOrderSerializer,
    RadiologyStudySerializer,
    RadiologyReportSerializer,
)
from audit.services import AuditService

logger = logging.getLogger(__name__)

class RadiologyTemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for managing radiology investigation templates."""

    permission_classes = [IsAuthenticated]
    serializer_class = RadiologyTemplateSerializer
    pagination_class = FlexiblePageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'modality', 'is_active', 'code']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'category', 'created_at']
    ordering = ['category', 'name']

    def get_queryset(self):
        return RadiologyTemplate.objects.all()

    def perform_create(self, serializer):
        template = serializer.save()

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='radiology_template',
            object_id=str(template.id),
            module='radiology',
            object_repr=f'Radiology Template {template.code}',
            description=f'Created radiology template: {template.name} ({template.code})',
            new_values={'code': template.code, 'name': template.name, 'category': template.category},
            request=self.request,
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        template = serializer.save()

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='radiology_template',
            object_id=str(template.id),
            module='radiology',
            object_repr=f'Radiology Template {template.code}',
            description=f'Updated radiology template: {template.name} ({template.code})',
            old_values={'name': old_instance.name, 'category': old_instance.category},
            new_values={'name': template.name, 'category': template.category},
            request=self.request,
        )

    @action(detail=True, methods=['post'])
    def toggle_status(self, request, pk=None):
        """Toggle active/inactive status of a template."""
        template = self.get_object()
        template.is_active = not template.is_active
        template.save()

        status_text = 'activated' if template.is_active else 'deactivated'

        # Log audit
        AuditService.log_activity(
            user=request.user,
            action='toggle_status',
            object_type='radiology_template',
            object_id=str(template.id),
            module='radiology',
            object_repr=f'Radiology Template {template.code}',
            description=f'{status_text.capitalize()} radiology template: {template.name} ({template.code})',
            old_values={'is_active': not template.is_active},
            new_values={'is_active': template.is_active},
            request=request,
        )

        return Response({
            'message': f'Template {status_text}',
            'template': RadiologyTemplateSerializer(template).data
        })


class RadiologyOrderViewSet(viewsets.ModelViewSet):
    """ViewSet for managing radiology orders."""

    permission_classes = [IsAuthenticated]
    serializer_class = RadiologyOrderSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'doctor', 'priority', 'consultation_session', 'visit']
    search_fields = [
        'order_id',
        'clinical_notes',
        'provisional_diagnosis',
        'studies__procedure',
        'studies__body_part',
        'studies__modality',
        'patient__first_name',
        'patient__surname',
        'patient__patient_id',
    ]
    ordering_fields = ['ordered_at']
    ordering = ['-ordered_at']

    def get_queryset(self):
        qs = (
            RadiologyOrder.objects.all()
            .select_related('patient', 'doctor', 'visit', 'consultation_session', 'created_by')
            .prefetch_related(
                'studies',
                'consultation_session__diagnoses__icd10_code',
                'visit__diagnoses__icd10_code',
            )
        )
        pm = self.request.query_params.get('processing_method')
        if pm in ('in_house', 'outsourced'):
            qs = qs.filter(studies__processing_method=pm).distinct()
        return qs

    def list(self, request, *args, **kwargs):
        logger.debug("RadiologyOrderViewSet.list() called")
        # Ensure all orders have at least one study before serialization
        orders = self.get_queryset()
        created_count = 0
        for order in orders:
            study_count = order.studies.count()
            logger.debug("Order %s (%s) has %s studies", order.id, order.order_id, study_count)
            if study_count == 0:
                logger.debug("Creating default study for order %s", order.id)
                RadiologyStudy.objects.create(
                    order=order,
                    procedure='Radiology Study',
                    body_part='',
                    modality='X-Ray',
                    status='pending',
                    images_count=0,
                    technical_notes='Auto-created for legacy order compatibility'
                )
                created_count += 1

        logger.debug("Created %s default studies", created_count)

        # Refresh queryset to include newly created studies
        self.queryset = self.get_queryset()

        # Debug: Check final study counts
        final_orders = self.get_queryset()
        for order in final_orders[:3]:  # Just check first 3
            logger.debug("Final - Order %s has %s studies", order.id, order.studies.count())

        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        logger.debug("RadiologyOrderViewSet.retrieve() called")
        # Ensure the order has at least one study before serialization
        order = self.get_object()
        study_count = order.studies.count()
        logger.debug(
            "Order %s (%s) has %s studies before retrieve",
            order.id,
            order.order_id,
            study_count,
        )

        if study_count == 0:
            logger.debug("ViewSet retrieve() creating default study for order %s", order.id)
            RadiologyStudy.objects.create(
                order=order,
                procedure='Radiology Study',
                body_part='',
                modality='X-Ray',
                status='pending',
                images_count=0,
                technical_notes='Auto-created for legacy order compatibility'
            )

        # Refresh the order object to include the new study
        order.refresh_from_db()
        study_count_after = order.studies.count()
        logger.debug("Order %s has %s studies after retrieve", order.id, study_count_after)

        return super().retrieve(request, *args, **kwargs)

    def perform_create(self, serializer):
        order = serializer.save(created_by=self.request.user)
        
        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='radiology_order',
            object_id=str(order.id),
            module='radiology',
            object_repr=f'Radiology Order {order.order_id}',
            description=f'Created radiology order {order.order_id} for patient {order.patient.get_full_name()}',
            new_values={'order_id': order.order_id, 'priority': order.priority, 'patient_id': str(order.patient.id)},
            request=self.request,
            )

        # Notify Radiology (doctor -> radiology)
        try:
            from notifications.services import NotificationService

            patient_name = order.patient.get_full_name()
            title = "New radiology order"
            message = f"Radiology order {order.order_id} for {patient_name} is ready for Radiology."

            NotificationService.notify_role(
                role_name='Radiologist',
                title=title,
                message=message,
                notification_type='radiology_result',
                priority='normal',
                action_url="/radiology/orders",
                object_type='radiology_order',
                object_id=str(order.id),
            )
        except Exception:
            # Notifications must never break radiology order creation
            pass

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
            
            # Log audit
            AuditService.log_activity(
                user=request.user,
                action='update',
                object_type='radiology_study',
                object_id=str(study.id),
                module='radiology',
                object_repr=f'Radiology Study {study.procedure}',
                description=f'Scheduled study: {study.procedure} (Order: {order.order_id})',
                old_values={'status': 'pending'},
                new_values={'status': 'scheduled', 'scheduled_date': str(study.scheduled_date), 'scheduled_time': str(study.scheduled_time)},
                metadata={'order_id': order.order_id},
                request=request,
            )
            
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
        images_count = int(request.data.get('images_count', 0))
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
            
            # Log audit
            AuditService.log_activity(
                user=request.user,
                action='update',
                object_type='radiology_study',
                object_id=str(study.id),
                module='radiology',
                object_repr=f'Radiology Study {study.procedure}',
                description=f'Completed acquisition for study: {study.procedure} (Order: {order.order_id})',
                old_values={'status': 'scheduled'},
                new_values={'status': 'acquired', 'processing_method': processing_method, 'images_count': images_count},
                metadata={'order_id': order.order_id, 'outsourced_facility': outsourced_facility if processing_method == 'outsourced' else ''},
                request=request,
            )
            
            return Response(RadiologyStudySerializer(study).data)
        except RadiologyStudy.DoesNotExist:
            return Response({'error': 'Study not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Error in acquire method")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def report(self, request, pk=None):
        """Create report for a study."""
        order = self.get_object()
        study_id = request.data.get('study_id')
        report = request.data.get('report', '')
        legacy_findings = request.data.get('findings', '')
        legacy_impression = request.data.get('impression', '')
        recommendations = request.data.get('recommendations', '')
        critical = request.data.get('critical', False) or request.data.get('critical') == 'true'
        report_file = request.FILES.get('report_file')
        
        try:
            study = order.studies.get(id=study_id)
            merged_report = (report or '').strip()
            if not merged_report and legacy_findings:
                merged_report = str(legacy_findings).strip()
            if legacy_impression:
                legacy_impression_text = str(legacy_impression).strip()
                if legacy_impression_text:
                    merged_report = f"{merged_report}\n\nImpression:\n{legacy_impression_text}".strip() if merged_report else f"Impression:\n{legacy_impression_text}"

            study.report = merged_report
            study.recommendations = recommendations
            study.status = 'reported'
            study.reported_by = request.user
            study.reported_at = timezone.now()
            if critical:
                study.report = f"[CRITICAL FINDING]\n\n{study.report}"
            if report_file:
                study.technical_notes = f"{study.technical_notes}\n\nReport file uploaded: {report_file.name}".strip()
            study.save()
            
            # Create or update report record
            try:
                report_record, created = RadiologyReport.objects.get_or_create(
                    study=study,
                    defaults={
                        'order': order,
                        'patient': order.patient,
                        'overall_status': 'critical' if critical else 'normal',
                    }
                )
                logger.debug(
                    "RadiologyReport %s for study %s, report ID: %s",
                    "created" if created else "updated",
                    study.id,
                    report_record.id,
                )
                if not created:
                    if critical:
                        report_record.overall_status = 'critical'
                    report_record.save()
                    logger.debug("Updated existing RadiologyReport %s", report_record.id)
            except Exception as e:
                logger.exception("Error creating RadiologyReport for study %s", study.id)
            
            # Log audit
            AuditService.log_activity(
                user=request.user,
                action='update',
                object_type='radiology_study',
                object_id=str(study.id),
                module='radiology',
                object_repr=f'Radiology Study {study.procedure}',
                description=f'Created report for study: {study.procedure} (Order: {order.order_id})' + (' [CRITICAL FINDING]' if critical else ''),
                old_values={'status': 'acquired'},
                new_values={'status': 'reported', 'critical': critical},
                    metadata={'order_id': order.order_id, 'has_report': bool(study.report)},
                request=request,
            )
            
            return Response(RadiologyStudySerializer(study).data)
        except RadiologyStudy.DoesNotExist:
            return Response({'error': 'Study not found'}, status=status.HTTP_404_NOT_FOUND)


class RadiologyStudyViewSet(viewsets.ModelViewSet):
    """ViewSet for managing individual radiology studies (like lab tests)."""

    permission_classes = [IsAuthenticated]
    serializer_class = RadiologyStudySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'processing_method', 'modality']
    search_fields = ['procedure', 'body_part']
    ordering_fields = ['created_at', 'scheduled_date']
    ordering = ['-created_at']

    def get_queryset(self):
        return RadiologyStudy.objects.all().select_related(
            'order', 'order__patient', 'order__doctor', 'template',
            'scheduled_by', 'acquired_by', 'reported_by', 'verified_by'
        )

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update study status (like lab test status)."""
        try:
            study = self.get_object()
            old_status = study.status  # Capture old status before updating
            new_status = request.data.get('status')
            processing_method = request.data.get('processing_method')
            outsourced_facility = request.data.get('outsourced_facility')

            logger.debug("update_study_status called for study %s, status: %s", study.id, new_status)

            if new_status not in ['pending', 'processing', 'reported', 'verified', 'rejected']:
                return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)

            # Update status
            study.status = new_status

            # Update processing method if provided
            if processing_method:
                study.processing_method = processing_method
            if outsourced_facility is not None:
                study.outsourced_facility = outsourced_facility if outsourced_facility else ''

            # Set timestamps based on status
            if new_status == 'processing':
                study.acquired_by = request.user
                study.acquired_at = timezone.now()
            elif new_status in ['results_ready', 'verified']:
                if not study.reported_by:
                    study.reported_by = request.user
                    study.reported_at = timezone.now()
                if new_status == 'verified':
                    study.verified_by = request.user
                    study.verified_at = timezone.now()

            study.save()

            # Log audit
            AuditService.log_activity(
                user=request.user,
                action='update_status',
                object_type='radiology_study',
                object_id=str(study.id),
                module='radiology',
                object_repr=f'Radiology Study {study.procedure}',
                description=f'Updated study status to {new_status}',
                old_values={'status': old_status},
                new_values={'status': new_status},
                request=request,
            )

            # Return serialized study data (like lab orders)
            return Response(RadiologyStudySerializer(study).data)
        except Exception as e:
            logger.exception("Exception in update_study_status")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def update_results(self, request, pk=None):
        """Update study results (like lab test results)."""
        # Handle FormData (multipart/form-data) vs JSON
        if request.content_type and 'multipart/form-data' in request.content_type:
            # For FormData, get values from request.POST
            report = request.POST.get('report', '')
            legacy_findings = request.POST.get('findings', '')
            legacy_impression = request.POST.get('impression', '')
            critical_str = request.POST.get('critical', 'false')
            critical = critical_str.lower() in ('true', '1', 'yes', 'on')
            status_update = request.POST.get('status')
        else:
            # For JSON, get values from request.data
            report = request.data.get('report', '')
            legacy_findings = request.data.get('findings', '')
            legacy_impression = request.data.get('impression', '')
            critical = request.data.get('critical', False)
            status_update = request.data.get('status')

        try:
            study = self.get_object()

            # Update fields
            merged_report = (report or '').strip()
            if not merged_report and legacy_findings:
                merged_report = str(legacy_findings).strip()
            if legacy_impression:
                legacy_impression_text = str(legacy_impression).strip()
                if legacy_impression_text:
                    merged_report = f"{merged_report}\n\nImpression:\n{legacy_impression_text}".strip() if merged_report else f"Impression:\n{legacy_impression_text}"

            study.report = merged_report
            study.critical = critical

            old_status = study.status
            if status_update:
                study.status = status_update

                # Set reporting timestamps
                if status_update == 'reported' and not study.reported_by:
                    study.reported_by = request.user
                    study.reported_at = timezone.now()
                    logger.debug("Set reported_by to %s", request.user.get_full_name())

            # Handle file upload
            if request.FILES.get('report_file'):
                logger.debug("Saving file: %s", request.FILES['report_file'].name)
                study.report_file = request.FILES['report_file']
                logger.debug("File assigned to study %s", study.id)
            else:
                logger.debug("No report_file in request.FILES")

            study.save()
            logger.debug("Study %s saved successfully", study.id)

            # Create or update report record for verification
            if status_update == 'reported':
                # Check if relationships exist
                if not study.order:
                    raise ValidationError(f"Study {study.id} has no associated order")

                if not study.order.patient:
                    raise ValidationError(f"Study {study.id} order has no associated patient")

                # Create or update RadiologyReport for verification workflow
                report_record, created = RadiologyReport.objects.get_or_create(
                    study=study,
                    defaults={
                        'order': study.order,
                        'patient': study.order.patient,
                        'overall_status': 'critical' if critical else 'normal',
                        'priority': 'high' if critical else 'medium',
                    }
                )

                if not created:
                    # Update existing report if critical status changed
                    report_record.overall_status = 'critical' if critical else 'normal'
                    report_record.priority = 'high' if critical else 'medium'
                    report_record.save()

            # Log audit
            AuditService.log_activity(
                user=request.user,
                action='update_results',
                object_type='radiology_study',
                object_id=str(study.id),
                module='radiology',
                object_repr=f'Radiology Study {study.procedure}',
                description=f'Updated results for study {study.procedure}' + (' [CRITICAL]' if critical else ''),
                old_values={'status': old_status},
                new_values={'status': status_update or study.status},
                request=request,
            )

            return Response(RadiologyStudySerializer(study).data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a study and send back for revision."""
        try:
            study = self.get_object()
            rejection_reason = request.data.get('reason', '')

            # Set study status back to 'acquired' so it can be re-reported
            study.status = 'acquired'
            study.verification_notes = f"Rejected: {rejection_reason}"
            study.rejected_by = request.user
            study.rejected_at = timezone.now()
            # Clear previous report data to allow re-reporting
            study.report = ''
            study.recommendations = ''
            study.reported_by = None
            study.reported_at = None
            study.save()

            # Log audit
            AuditService.log_activity(
                user=request.user,
                action='reject',
                object_type='radiology_study',
                object_id=str(study.id),
                module='radiology',
                object_repr=f'Radiology Study {study.procedure}',
                description=f'Rejected radiology study: {study.procedure} (Order: {study.order.order_id}) - {rejection_reason}',
                old_values={'status': 'reported'},
                new_values={'status': 'acquired'},
                metadata={'order_id': study.order.order_id, 'rejection_reason': rejection_reason},
                request=request,
            )

            return Response(RadiologyStudySerializer(study).data)
        except RadiologyStudy.DoesNotExist:
            return Response({'error': 'Study not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Error rejecting study")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def create_reports_for_reported_studies(self, request):
        """Create RadiologyReport records for all studies with 'reported' status that don't have them."""
        from .models import RadiologyStudy, RadiologyReport

        reported_studies = RadiologyStudy.objects.filter(status='reported')
        created_count = 0

        logger.debug("Found %s studies with status='reported'", reported_studies.count())

        for study in reported_studies:
            # Check if RadiologyReport already exists
            existing_report = RadiologyReport.objects.filter(study=study).first()
            if existing_report:
                logger.debug("RadiologyReport already exists for study %s: %s", study.id, existing_report.id)
                continue

            try:
                # Create RadiologyReport
                report_record = RadiologyReport.objects.create(
                    study=study,
                    order=study.order,
                    patient=study.order.patient,
                    overall_status='critical' if study.critical else 'normal',
                    priority='high' if study.critical else 'medium',
                )
                created_count += 1
                logger.debug("Created RadiologyReport %s for study %s", report_record.id, study.id)
            except Exception as e:
                logger.exception("Error creating RadiologyReport for study %s", study.id)

        return Response({
            'message': f'Created {created_count} RadiologyReport records',
            'reported_studies_count': reported_studies.count()
        })


class RadiologyReportViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing radiology reports awaiting verification."""

    permission_classes = [IsAuthenticated]
    serializer_class = RadiologyReportSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['patient', 'overall_status', 'priority']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def list(self, request, *args, **kwargs):
        logger.debug("RadiologyReportViewSet.list() called")

        # Check all RadiologyReport records
        all_reports = RadiologyReport.objects.all()
        logger.debug("Total RadiologyReport records: %s", all_reports.count())

        for report in all_reports:
            logger.debug(
                "Report %s: study_id=%s, study_status=%s, patient=%s",
                report.id,
                report.study_id,
                report.study.status,
                report.patient_id,
            )

        # Check studies with reported status
        reported_studies = RadiologyStudy.objects.filter(status='reported')
        logger.debug("Studies with status='reported': %s", reported_studies.count())

        for study in reported_studies:
            has_report = RadiologyReport.objects.filter(study=study).exists()
            logger.debug("Study %s (%s) has RadiologyReport: %s", study.id, study.procedure, has_report)

        return super().list(request, *args, **kwargs)
    
    def get_queryset(self):
        # Filter by status if provided, default to 'reported' for pending verifications
        status_filter = self.request.query_params.get('status', 'reported')

        queryset = RadiologyReport.objects.select_related('study', 'order', 'patient', 'order__doctor', 'study__reported_by')

        logger.debug("RadiologyReportViewSet.get_queryset called with status_filter='%s'", status_filter)
        logger.debug("Total RadiologyReport records in DB: %s", RadiologyReport.objects.count())
        logger.debug("RadiologyReport records before filtering: %s", queryset.count())

        if status_filter == 'reported':
            # Only show reports that are ready for verification (exclude rejected)
            queryset = queryset.filter(study__status='reported')
            logger.debug("After filtering for study__status='reported': %s", queryset.count())
        elif status_filter == 'verified':
            # Show verified reports
            queryset = queryset.filter(study__status='verified')
            logger.debug("After filtering for study__status='verified': %s", queryset.count())
        elif status_filter == 'all':
            # Show all reports (both pending and verified)
            queryset = queryset.filter(study__status__in=['reported', 'verified'])
            logger.debug("After filtering for study__status in ['reported', 'verified']: %s", queryset.count())

        logger.debug("Final queryset count: %s", queryset.count())
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
        
        # Log audit
        AuditService.log_activity(
            user=request.user,
            action='verify',
            object_type='radiology_report',
            object_id=str(report.id),
            module='radiology',
            object_repr=f'Radiology Report for {study.procedure}',
            description=f'Verified radiology report: {study.procedure} (Order: {report.order.order_id})',
            old_values={'study_status': 'reported'},
            new_values={'study_status': 'verified', 'overall_status': report.overall_status},
            metadata={'order_id': report.order.order_id, 'verification_notes': study.verification_notes},
            request=request,
        )
        
        return Response(RadiologyReportSerializer(report).data)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a radiology report and send back for revision."""
        report = self.get_object()
        study = report.study
        rejection_reason = request.data.get('reason', '')
        
        # Set study status to 'rejected' so it appears in rejected tab
        study.status = 'rejected'
        study.verification_notes = f"Rejected: {rejection_reason}"
        study.rejected_by = request.user
        study.rejected_at = timezone.now()
        study.verified_by = None
        study.verified_at = None
        # Clear previous report data to allow re-reporting
        study.report = ''
        study.recommendations = ''
        study.reported_by = None
        study.reported_at = None
        study.save()
        
        # Delete the report record so it's no longer in verification queue
        report_id = str(report.id)
        report.delete()
        
        # Log audit
        AuditService.log_activity(
            user=request.user,
            action='reject',
            object_type='radiology_report',
            object_id=report_id,
            module='radiology',
            object_repr=f'Radiology Report for {study.procedure}',
            description=f'Rejected radiology report: {study.procedure} (Order: {study.order.order_id}) - {rejection_reason}',
            old_values={'study_status': 'reported'},
            new_values={'study_status': 'acquired'},
            metadata={'order_id': study.order.order_id, 'rejection_reason': rejection_reason},
            request=request,
        )
        
        return Response({
            'message': 'Report rejected and sent back for revision',
            'study': RadiologyStudySerializer(study).data
        })
