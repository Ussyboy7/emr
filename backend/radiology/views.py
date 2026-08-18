"""
Views for the Radiology app.
"""
import logging
import json
from rest_framework import viewsets, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from drf_spectacular.utils import extend_schema
from django.utils import timezone
from django.db.models import Count, Q
from django.db import transaction
from django.http import HttpResponse
from organization.models import Clinic, SystemConfig
from organization.routing import ensure_internal_processing_destination

from common.pagination import CatalogPageNumberPagination
from laboratory.pagination import FlexiblePageNumberPagination

from common.mixins import FacilityScopedMixin, LabRadiologyScopedMixin
from common.openapi import ORDER_DISPATCH_PK_PARAMS, document_viewset
from permissions.user_capabilities import ensure_capability, user_has_capability
logger = logging.getLogger(__name__)


def _parse_location_clinic_id(request):
    """Parse optional ``location_clinic`` query param (organization.Clinic PK)."""
    raw = request.query_params.get('location_clinic')
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _ensure_route_facility_access(user, clinic):
    if not clinic or not SystemConfig.is_enabled('multi_clinic_enabled') or user.is_superuser:
        return
    if user_has_capability(user, 'clinical_data_view_all'):
        return
    assigned = set(user.location_clinics.values_list('id', flat=True))
    if not assigned and user.location_clinic_id:
        assigned = {user.location_clinic_id}
    if clinic.pk not in assigned:
        raise PermissionDenied('You are not assigned to this facility.')


def _ensure_order_facility_access(user, order):
    """Allow order mutations from either its origin or current facility."""
    if not SystemConfig.is_enabled('multi_clinic_enabled') or user.is_superuser:
        return
    assigned = set(user.location_clinics.values_list('id', flat=True))
    if not assigned and user.location_clinic_id:
        assigned = {user.location_clinic_id}
    order_facility_ids = {order.location_clinic_id, order.processing_clinic_id} - {None}
    if not order_facility_ids:
        # Legacy/external orders with no facility are unrestricted, matching
        # list scoping that keeps them visible to everyone.
        return
    if not assigned.intersection(order_facility_ids):
        raise PermissionDenied('You are not assigned to this order facility.')
from .models import (
    RadiologyTemplate,
    RadiologyOrder,
    RadiologyStudy,
    RadiologyStudyRoutingEvent,
    RadiologyStudyReportAttachment,
    RadiologyReport,
    ImagingPartner,
    RadiologyReferralDispatch,
)
from .serializers import (
    RadiologyTemplateSerializer,
    RadiologyOrderSerializer,
    RadiologyStudySerializer,
    RadiologyStudyRoutingEventSerializer,
    RadiologyReportSerializer,
    ImagingPartnerSerializer,
    RadiologyReferralDispatchSerializer,
)
from audit.services import AuditService


def _parse_custom_reports(value):
    if not value:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _summarize_custom_reports(rows):
    lines = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        procedure = str(row.get('procedure') or row.get('name') or '').strip()
        report = str(row.get('report') or '').strip()
        recommendations = str(row.get('recommendations') or '').strip()
        critical = bool(row.get('critical'))
        if not any([procedure, report, recommendations, critical]):
            continue
        block = []
        block.append(procedure or 'Custom Study')
        if critical:
            block.append('[CRITICAL FINDING]')
        if report:
            block.append(report)
        if recommendations:
            block.append(f"Recommendations: {recommendations}")
        lines.append('\n'.join(block))
    return '\n\n'.join(lines)


@document_viewset(tag="Radiology", resource="imaging partners")
class ImagingPartnerViewSet(viewsets.ModelViewSet):
    """CRUD for outsourced imaging partners (dropdown + Django admin)."""
    serializer_class = ImagingPartnerSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "code", "email"]
    ordering_fields = ["sort_order", "name", "created_at"]
    ordering = ["sort_order", "name"]
    # Small catalog: return a plain JSON array (avoids pagination quirks in clients).
    pagination_class = None

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ImagingPartner.objects.none()
        
        return ImagingPartner.objects.all()


@document_viewset(tag="Radiology", resource="radiology templates")
class RadiologyTemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for managing radiology investigation templates."""
    serializer_class = RadiologyTemplateSerializer
    pagination_class = CatalogPageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'modality', 'is_active', 'code']
    search_fields = ['name', 'code', 'description', 'body_part']
    ordering_fields = ['name', 'category', 'created_at']
    ordering = ['category', 'name']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return RadiologyTemplate.objects.none()
        
        return RadiologyTemplate.objects.all()

    @extend_schema(tags=["Radiology"], summary="Resolve", description="Return a single template by exact code (no paginated list hop).")
    @action(detail=False, methods=['get'], url_path='resolve')
    def resolve_template(self, request):
        """Return a single template by exact code (no paginated list hop)."""
        from common.diagnostic_catalog import resolve_catalog_template_by_code

        code = request.query_params.get('code') or ''
        data, error = resolve_catalog_template_by_code(
            self.get_queryset(),
            code,
            RadiologyTemplateSerializer,
        )
        if error is not None:
            return error
        return Response(data)

    @extend_schema(tags=["Radiology"], summary="List stats", description="Template tab counts in one request.")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Template tab counts in one request."""
        from common.diagnostic_catalog import build_catalog_list_stats

        categories = ['xray', 'ultrasound', 'mri', 'ct']
        return Response(build_catalog_list_stats(RadiologyTemplate.objects.all(), categories))

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

    @extend_schema(tags=["Radiology"], summary="Toggle status", description="Toggle active/inactive status of a template.")
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


@document_viewset(tag="Radiology", resource="radiology orders")
class RadiologyOrderViewSet(LabRadiologyScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing radiology orders."""
    serializer_class = RadiologyOrderSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'doctor', 'priority', 'consultation_session', 'visit', 'source_type', 'external_clinic', 'location_clinic']
    facility_scope_fields = ('location_clinic', 'processing_clinic', 'studies__processing_clinic')
    include_unassigned_scope = True
    search_fields = [
        'order_id',
        'clinical_notes',
        'provisional_diagnosis',
        'external_requesting_doctor_name',
        'manual_request_reference',
        'external_clinic__name',
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
        if getattr(self, 'swagger_fake_view', False):
            return RadiologyOrder.objects.none()
        
        qs = (
            RadiologyOrder.objects.all()
            .select_related(
                'patient', 'doctor', 'visit', 'consultation_session', 'created_by',
                'external_clinic', 'location_clinic', 'processing_clinic',
            )
            .prefetch_related(
                'studies',
                'consultation_session__diagnoses__icd10_code',
                'visit__diagnoses__icd10_code',
            )
        )
        pm = self.request.query_params.get('processing_method')
        if pm in ('in_house', 'outsourced'):
            qs = qs.filter(studies__processing_method=pm).distinct()
        source_type = self.request.query_params.get('source_type')
        if source_type in ('internal_emr', 'external_manual'):
            qs = qs.filter(source_type=source_type)
        processing_clinic_id = self.request.query_params.get('processing_clinic')
        if processing_clinic_id:
            qs = qs.filter(
                Q(processing_clinic_id=processing_clinic_id)
                | Q(studies__processing_clinic_id=processing_clinic_id)
            ).distinct()
        study_status = self.request.query_params.get('study_status')
        if study_status == 'pending':
            qs = qs.filter(
                studies__status__in=('pending', 'scheduled', 'acquired')
            ).distinct()
        elif study_status in ('processing', 'reported', 'rejected', 'verified'):
            qs = qs.filter(studies__status=study_status).distinct()
        gender = self.request.query_params.get('gender')
        if gender in ('male', 'female'):
            qs = qs.filter(patient__gender=gender)
        location_clinic_id = _parse_location_clinic_id(self.request)
        if location_clinic_id is not None:
            qs = qs.filter(location_clinic_id=location_clinic_id)
        # Date filtering — defaults to the order timestamp, but callers can
        # ask for filtering on the study rejection timestamp instead
        # (e.g. the "Rejected" tab, which wants "today's rejections" regardless
        # of when the order was originally placed).
        exact_date = self.request.query_params.get('date')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        date_field = self.request.query_params.get('date_field')
        if date_field == 'rejected_at':
            date_lookup = 'studies__rejected_at__date'
        else:
            date_lookup = 'ordered_at__date'
        if exact_date:
            qs = qs.filter(**{date_lookup: exact_date}).distinct()
        else:
            if start_date:
                qs = qs.filter(**{f'{date_lookup}__gte': start_date})
            if end_date:
                qs = qs.filter(**{f'{date_lookup}__lte': end_date})
            if start_date or end_date:
                qs = qs.distinct()
        return self.scope_queryset(qs)

    @extend_schema(tags=["Radiology"], summary="Stats", description="Server-side counts for radiology order dashboard cards/tabs.")
    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        """
        Server-side counts for radiology order dashboard cards/tabs.

        Date semantics:
          - All counts except ``rejected`` are scoped by ``ordered_at``.
          - ``rejected`` is scoped by ``studies__rejected_at`` so "Today" on
            the Rejected card reflects today's rejections regardless of when
            the underlying orders were placed.
        """
        date = request.query_params.get('date')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        base_qs = (
            RadiologyOrder.objects.all()
            .select_related(
                'patient', 'doctor', 'visit', 'consultation_session', 'created_by',
                'external_clinic', 'location_clinic', 'processing_clinic',
            )
            .prefetch_related('studies')
        )
        pm = request.query_params.get('processing_method')
        if pm in ('in_house', 'outsourced'):
            base_qs = base_qs.filter(studies__processing_method=pm).distinct()
        source_type = request.query_params.get('source_type')
        if source_type in ('internal_emr', 'external_manual'):
            base_qs = base_qs.filter(source_type=source_type)
        processing_clinic_id = request.query_params.get('processing_clinic')
        if processing_clinic_id:
            base_qs = base_qs.filter(
                Q(processing_clinic_id=processing_clinic_id)
                | Q(studies__processing_clinic_id=processing_clinic_id)
            ).distinct()
        gender = request.query_params.get('gender')
        if gender in ('male', 'female'):
            base_qs = base_qs.filter(patient__gender=gender)
        location_clinic_id = _parse_location_clinic_id(request)
        if location_clinic_id is not None:
            base_qs = base_qs.filter(location_clinic_id=location_clinic_id)
        base_qs = self.filter_queryset(base_qs)

        def with_date(qs, field):
            if date:
                return qs.filter(**{f'{field}__date': date})
            narrowed = qs
            if start_date:
                narrowed = narrowed.filter(**{f'{field}__date__gte': start_date})
            if end_date:
                narrowed = narrowed.filter(**{f'{field}__date__lte': end_date})
            return narrowed

        ordered_scoped = with_date(base_qs, 'ordered_at')
        rejected_scoped = with_date(base_qs, 'studies__rejected_at')

        summary = ordered_scoped.aggregate(
            total=Count('id', distinct=True),
            pending=Count(
                'id',
                filter=Q(studies__status__in=('pending', 'scheduled', 'acquired')),
                distinct=True,
            ),
            processing=Count('id', filter=Q(studies__status='processing'), distinct=True),
            results_ready=Count('id', filter=Q(studies__status='reported'), distinct=True),
            stat=Count('id', filter=Q(priority='stat'), distinct=True),
        )
        rejected_count = (
            rejected_scoped.filter(studies__status='rejected').distinct().count()
        )
        return Response({
            'total': summary.get('total', 0) or 0,
            'pending': summary.get('pending', 0) or 0,
            'processing': summary.get('processing', 0) or 0,
            'results_ready': summary.get('results_ready', 0) or 0,
            'rejected': rejected_count,
            'stat': summary.get('stat', 0) or 0,
        })

    def create(self, request, *args, **kwargs):
        data = request.data.dict() if hasattr(request.data, 'dict') else dict(request.data)
        if 'manual_request_file' in request.FILES:
            data['manual_request_file'] = request.FILES['manual_request_file']

        studies_data = data.get('studies_data')
        if isinstance(studies_data, str):
            try:
                parsed_studies = json.loads(studies_data)
                if isinstance(parsed_studies, list):
                    data['studies_data'] = parsed_studies
            except json.JSONDecodeError:
                return Response(
                    {'studies_data': 'Invalid studies_data JSON payload.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    def perform_create(self, serializer):
        self.auto_set_facility(serializer)
        order = serializer.save(created_by=self.request.user)
        
        # Log audit
        requester_name = (
            order.external_requesting_doctor_name
            if order.source_type == 'external_manual'
            else (order.doctor.get_full_name() if order.doctor else 'Unknown')
        )
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='radiology_order',
            object_id=str(order.id),
            module='radiology',
            object_repr=f'Radiology Order {order.order_id}',
            description=f'Created radiology order {order.order_id} for patient {order.patient.get_full_name()} by Dr. {requester_name}',
            new_values={
                'order_id': order.order_id,
                'priority': order.priority,
                'patient_id': str(order.patient.id),
                'source_type': order.source_type,
            },
            request=self.request,
            )

        # Notify Radiology (doctor -> radiology). STAT orders escalate
        # the notification priority so the bell + toast + sound matches
        # the clinical urgency.
        try:
            from notifications.services import NotificationService, priority_from_lab_or_radiology

            patient_name = order.patient.get_full_name()
            order_priority = getattr(order, 'priority', 'routine')
            notif_priority = priority_from_lab_or_radiology(order_priority)
            stat_prefix = "STAT — " if notif_priority == 'urgent' else ''
            title = f"{stat_prefix}New radiology order"
            if order.source_type == 'external_manual':
                clinic_name = order.external_clinic.name if order.external_clinic else 'external clinic'
                message = f"External radiology request {order.order_id} for {patient_name} from {clinic_name} is ready for Radiology."
            else:
                message = f"Radiology order {order.order_id} for {patient_name} is ready for Radiology."

            NotificationService.notify_role(
                role_name='Radiologist',
                title=title,
                message=message,
                notification_type='radiology_result',
                priority=notif_priority,
                action_url="/radiology/orders",
                object_type='radiology_order',
                object_id=str(order.id),
                clinic_id=getattr(self.request.user, 'location_clinic_id', None),
            )
        except Exception:
            # Notifications must never break radiology order creation
            pass

    @extend_schema(tags=["Radiology"], summary="Schedule", description="Schedule a study.")
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
    
    @extend_schema(tags=["Radiology"], summary="Acquire", description="Complete acquisition of a study.")
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

    @extend_schema(tags=["Radiology"], summary="Report", description="Create report for a study.")
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

    # ------------------------------------------------------------------
    # Outsourced dispatch — mirrors `LabOrderViewSet` dispatch actions.
    # ------------------------------------------------------------------

    @action(detail=True, methods=['post'], url_path='route-studies')
    def route_studies(self, request, pk=None):
        ensure_capability(
            request.user,
            'radiology_perform',
            'Only authorised radiology staff can route studies.',
        )
        order = self.get_object()
        study_ids = request.data.get('study_ids') or []
        destination_type = request.data.get('destination_type')
        if not isinstance(study_ids, list) or not study_ids:
            return Response({'error': 'study_ids must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)
        if destination_type not in ('internal', 'external'):
            return Response({'error': 'destination_type must be internal or external'}, status=status.HTTP_400_BAD_REQUEST)

        external_destination = (request.data.get('external_destination') or '').strip()
        processing_clinic_id = request.data.get('processing_clinic')
        if destination_type == 'external' and not external_destination:
            return Response({'error': 'external_destination is required'}, status=status.HTTP_400_BAD_REQUEST)
        if destination_type == 'internal' and not processing_clinic_id:
            return Response({'error': 'processing_clinic is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            study_ids = [int(study_id) for study_id in study_ids]
            processing_clinic = None
            if destination_type == 'internal':
                processing_clinic = Clinic.objects.get(pk=processing_clinic_id)
                _ensure_route_facility_access(request.user, processing_clinic)
            with transaction.atomic():
                locked_order = RadiologyOrder.objects.select_for_update().get(pk=order.pk)
                if destination_type == 'internal':
                    ensure_internal_processing_destination(locked_order.location_clinic, processing_clinic)
                _ensure_route_facility_access(request.user, locked_order.location_clinic)
                studies = list(RadiologyStudy.objects.select_for_update().filter(order=locked_order, id__in=study_ids))
                if len(studies) != len(set(study_ids)):
                    return Response({'error': 'Some studies are not part of this order'}, status=status.HTTP_400_BAD_REQUEST)
                non_routeable = [
                    study for study in studies
                    if study.status in ('reported', 'verified')
                    or study.routing_status == 'cancelled'
                ]
                if non_routeable:
                    return Response(
                        {'error': 'These studies can no longer be routed: ' + ', '.join(
                            f'{study.procedure} ({study.status}/{study.routing_status})' for study in non_routeable
                        )},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                reason = (request.data.get('reason') or '').strip()
                if destination_type == 'external' and not reason:
                    return Response(
                        {'error': 'reason is required for external routing.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if destination_type == 'internal':
                    issued_dispatch_ids = locked_order.dispatches.filter(
                        status='issued', studies__in=studies,
                    ).values_list('id', flat=True).distinct()
                    issued_dispatches = list(
                        locked_order.dispatches.select_for_update().filter(id__in=issued_dispatch_ids)
                    )
                    for dispatch in issued_dispatches:
                        dispatch_study_ids = set(dispatch.studies.values_list('id', flat=True))
                        remaining_study_ids = dispatch_study_ids - {study.id for study in studies}
                        if remaining_study_ids:
                            replacement = RadiologyReferralDispatch.objects.create(
                                order=locked_order,
                                partner=dispatch.partner,
                                partner_name=dispatch.partner_name,
                                partner_address_snapshot=dispatch.partner_address_snapshot,
                                notes=dispatch.notes,
                                issued_by=dispatch.issued_by,
                            )
                            replacement.studies.set(RadiologyStudy.objects.filter(id__in=remaining_study_ids))
                            dispatch.status = 'superseded'
                            dispatch.superseded_by = replacement
                            dispatch.save(update_fields=['status', 'superseded_by'])
                            new_status = 'superseded'
                        else:
                            dispatch.status = 'cancelled'
                            dispatch.cancellation_reason = reason or 'Superseded by internal reroute'
                            dispatch.cancelled_at = timezone.now()
                            dispatch.cancelled_by = request.user
                            dispatch.save(update_fields=[
                                'status', 'cancellation_reason', 'cancelled_at', 'cancelled_by',
                            ])
                            new_status = 'cancelled'
                        AuditService.log_activity(
                            user=request.user, action='update', object_type='radiology_referral_dispatch',
                            object_id=str(dispatch.id), module='radiology',
                            object_repr=dispatch.dispatch_id,
                            description=f'{new_status.title()} dispatch {dispatch.dispatch_id} for internal reroute',
                            new_values={
                                'status': new_status,
                                'cancellation_reason': dispatch.cancellation_reason,
                            },
                            metadata={'order_id': locked_order.order_id}, request=request,
                        )
                events = []
                for study in studies:
                    event = RadiologyStudyRoutingEvent.objects.create(
                        study=study,
                        from_clinic=study.processing_clinic,
                        to_clinic=processing_clinic,
                        destination_type=destination_type,
                        external_destination=external_destination,
                        reason=reason,
                        changed_by=request.user,
                    )
                    study.processing_clinic = processing_clinic
                    study.routing_status = 'referred_external' if destination_type == 'external' else 'sent_to_processing'
                    if destination_type == 'external':
                        study.processing_method = 'outsourced'
                        study.outsourced_facility = external_destination
                        study.status = 'processing'
                    else:
                        study.processing_method = 'in_house'
                        study.outsourced_facility = ''
                    update_fields = ['processing_clinic', 'routing_status', 'updated_at']
                    if destination_type == 'external':
                        update_fields.extend(['processing_method', 'outsourced_facility', 'status'])
                    else:
                        update_fields.extend(['processing_method', 'outsourced_facility'])
                    study.save(update_fields=update_fields)
                    events.append(event)

                dispatch = None
                if destination_type == 'external':
                    dispatch = RadiologyReferralDispatch.objects.create(
                        order=locked_order,
                        partner_name=external_destination,
                        issued_by=request.user,
                        notes=(request.data.get('reason') or '').strip(),
                    )
                    dispatch.studies.set(studies)
                AuditService.log_activity(
                    user=request.user, action='update', object_type='radiology_study_routing',
                    object_id=str(locked_order.pk), module='radiology',
                    object_repr=locked_order.order_id,
                    description=f'Routed {len(studies)} study(ies) from {locked_order.order_id}',
                    new_values={'study_ids': study_ids, 'destination_type': destination_type},
                    request=request,
                )
            payload = {
                'lines': RadiologyStudySerializer(studies, many=True).data,
                'routing_events': RadiologyStudyRoutingEventSerializer(events, many=True).data,
            }
            if dispatch:
                payload['dispatch'] = RadiologyReferralDispatchSerializer(dispatch).data
            return Response(payload)
        except (ValueError, Clinic.DoesNotExist):
            return Response({'error': 'Invalid study_ids or processing_clinic'}, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(tags=["Radiology"], summary="Dispatches", description="List every RadiologyReferralDispatch ever issued for this order (most recent first).")
    @action(detail=True, methods=['get'], url_path='dispatches')
    def list_dispatches(self, request, pk=None):
        """List every RadiologyReferralDispatch ever issued for this order (most recent first)."""
        order = self.get_object()
        dispatches = order.dispatches.all().prefetch_related('studies')
        return Response(RadiologyReferralDispatchSerializer(dispatches, many=True).data)

    @extend_schema(tags=["Radiology"], summary="Dispatch outsourced", description="Send a batch of studies in this order to one external imaging partner.")
    @action(detail=True, methods=['post'], url_path='dispatch_outsourced')
    @transaction.atomic
    def dispatch_outsourced(self, request, pk=None):
        """
        Send a batch of studies in this order to one external imaging partner.

        body: {
          study_ids: number[]                # studies in this order to dispatch
          partner_id?: number                # preferred — FK to ImagingPartner
          partner_name?: string              # required when partner_id is missing
                                             # (ad-hoc 'Other' partner)
          notes?: string                     # optional dispatch-level notes
          supersede_dispatch_id?: number     # if re-routing, mark old dispatch superseded
        }
        """
        ensure_capability(
            request.user,
            'radiology_perform',
            'Only authorised radiology staff can dispatch studies externally.',
        )
        order = self.get_object()
        _ensure_order_facility_access(request.user, order)
        order = RadiologyOrder.objects.select_for_update().get(pk=order.pk)

        study_ids = request.data.get('study_ids') or []
        if not isinstance(study_ids, list) or not study_ids:
            return Response(
                {'error': 'study_ids must be a non-empty list'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        partner_id = request.data.get('partner_id')
        partner_name_raw = (request.data.get('partner_name') or '').strip()
        notes = (request.data.get('notes') or '').strip()
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'error': 'reason is required for external dispatch.'}, status=status.HTTP_400_BAD_REQUEST)
        supersede_id = request.data.get('supersede_dispatch_id')

        partner = None
        partner_name = ''
        if partner_id:
            try:
                partner = ImagingPartner.objects.get(id=partner_id, is_active=True)
                partner_name = partner.name
            except ImagingPartner.DoesNotExist:
                return Response(
                    {'error': 'Imaging partner not found or inactive'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif partner_name_raw:
            partner_name = partner_name_raw
        else:
            return Response(
                {'error': 'Either partner_id or partner_name is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve the studies; refuse to dispatch studies from another order.
        studies = list(order.studies.select_for_update().filter(id__in=study_ids))
        missing = set(study_ids) - {s.id for s in studies}
        if missing:
            return Response(
                {'error': f'Some studies are not part of this order: {sorted(missing)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        active_overlap = order.dispatches.filter(status='issued', studies__in=studies).distinct()
        if active_overlap.exists() and not supersede_id:
            return Response(
                {'error': 'One or more selected studies already have an active dispatch.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Studies must be at or before "processing" — refuse to dispatch
        # studies that already have a report or have been verified (those need
        # a different workflow).
        non_dispatchable = [s for s in studies if s.status in ('reported', 'verified')]
        if non_dispatchable:
            return Response(
                {
                    'error': (
                        'These studies can no longer be dispatched: '
                        + ', '.join(f'{s.procedure} ({s.status})' for s in non_dispatchable)
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optionally mark a prior dispatch as superseded (when re-routing).
        prior = None
        if supersede_id:
            try:
                prior = order.dispatches.select_for_update().get(id=supersede_id, status='issued')
            except RadiologyReferralDispatch.DoesNotExist:
                return Response(
                    {'error': 'Prior dispatch not found or not currently issued'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            selected_study_ids = {study.id for study in studies}
            prior_study_ids = set(prior.studies.values_list('id', flat=True))
            if not selected_study_ids.issubset(prior_study_ids):
                return Response(
                    {'error': 'Prior dispatch must cover all selected studies.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Create the new dispatch.
        partner_address_snapshot = ''
        if partner:
            partner_address_snapshot = (partner.address or '').strip()

        dispatch = RadiologyReferralDispatch.objects.create(
            order=order,
            partner=partner,
            partner_name=partner_name,
            partner_address_snapshot=partner_address_snapshot,
            notes=notes or reason,
            issued_by=request.user,
        )
        dispatch.studies.set(studies)

        # Flip each study to processing/outsourced and stamp the partner name
        # onto the existing free-text `outsourced_facility` field for parity
        # with the lab pattern (LabTest.outsourced_lab works the same way).
        for study in studies:
            RadiologyStudyRoutingEvent.objects.create(
                study=study,
                from_clinic=study.processing_clinic,
                to_clinic=None,
                destination_type='external',
                external_destination=partner_name,
                reason=reason,
                changed_by=request.user,
            )
            study.routing_status = 'referred_external'
            study.processing_method = 'outsourced'
            study.outsourced_facility = partner_name
            study.status = 'processing'
            study.save(update_fields=[
                'routing_status', 'processing_method', 'outsourced_facility', 'status', 'updated_at',
            ])

        if prior:
            prior.status = 'superseded'
            prior.superseded_by = dispatch
            prior.save(update_fields=['status', 'superseded_by'])

        AuditService.log_activity(
            user=request.user,
            action='create',
            object_type='radiology_referral_dispatch',
            object_id=str(dispatch.id),
            module='radiology',
            object_repr=dispatch.dispatch_id,
            description=(
                f'Dispatched {len(studies)} study(ies) from {order.order_id} '
                f'to {partner_name}'
            ),
            new_values={
                'dispatch_id': dispatch.dispatch_id,
                'partner_name': partner_name,
                'study_procedures': [s.procedure for s in studies],
            },
            metadata={'order_id': order.order_id, 'supersedes': prior.dispatch_id if prior else None},
            request=request,
        )

        return Response(
            RadiologyReferralDispatchSerializer(dispatch).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(tags=["Radiology"], summary="Dispatches/(?P<dispatch pk>[^/.]+)/cancel", description="Cancel a still-issued dispatch (e.g. wrong partner, withdrew request).", parameters=ORDER_DISPATCH_PK_PARAMS)
    @action(detail=True, methods=['post'], url_path='dispatches/(?P<dispatch_pk>[^/.]+)/cancel')
    @transaction.atomic
    def cancel_dispatch(self, request, pk=None, dispatch_pk=None):
        """
        Cancel a still-issued dispatch (e.g. wrong partner, withdrew request).

        Each study on the dispatch is reverted to ``pending`` and its
        outsourcing fields cleared (`processing_method`, `outsourced_facility`).
        That puts the studies back in the eligible pool so a fresh dispatch
        can be issued without a separate manual reset. Studies already past
        ``processing`` (reports submitted / verified) are left alone — those
        need radiologist review.
        """
        order = self.get_object()
        _ensure_order_facility_access(request.user, order)
        try:
            dispatch = order.dispatches.select_for_update().get(id=dispatch_pk)
        except RadiologyReferralDispatch.DoesNotExist:
            return Response({'error': 'Dispatch not found'}, status=status.HTTP_404_NOT_FOUND)

        if dispatch.status != 'issued':
            return Response(
                {'error': f'Dispatch is already {dispatch.status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data.get('reason') or '').strip()

        reverted_procedures: list[str] = []
        skipped_procedures: list[str] = []
        for study in dispatch.studies.select_for_update().all():
            # Only revert studies that are still in the outsourced 'processing'
            # bucket. If a report has been submitted or verified, untangling
            # it requires the verification UI, not a cancel button.
            if study.status == 'processing':
                return_clinic = study.processing_clinic or order.processing_clinic or order.location_clinic
                RadiologyStudyRoutingEvent.objects.create(
                    study=study,
                    from_clinic=study.processing_clinic,
                    to_clinic=return_clinic,
                    destination_type='internal' if return_clinic else 'external',
                    external_destination='' if return_clinic else 'Cancelled external dispatch',
                    reason=reason,
                    changed_by=request.user,
                )
                study.routing_status = 'pending_triage'
                study.status = 'pending'
                study.processing_method = None
                study.outsourced_facility = ''
                study.save(update_fields=[
                    'status', 'processing_method', 'outsourced_facility', 'routing_status', 'updated_at',
                ])
                reverted_procedures.append(study.procedure)
            else:
                skipped_procedures.append(f'{study.procedure} ({study.status})')

        dispatch.status = 'cancelled'
        dispatch.cancellation_reason = reason
        dispatch.cancelled_at = timezone.now()
        dispatch.cancelled_by = request.user
        dispatch.save(update_fields=['status', 'cancellation_reason', 'cancelled_at', 'cancelled_by'])

        AuditService.log_activity(
            user=request.user,
            action='update',
            object_type='radiology_referral_dispatch',
            object_id=str(dispatch.id),
            module='radiology',
            object_repr=dispatch.dispatch_id,
            description=(
                f'Cancelled dispatch {dispatch.dispatch_id}'
                + (f' (reverted {len(reverted_procedures)} study(ies))' if reverted_procedures else '')
            ),
            new_values={
                'status': 'cancelled',
                'cancellation_reason': reason,
                'reverted_studies': reverted_procedures,
                'skipped_studies': skipped_procedures,
            },
            metadata={'order_id': order.order_id},
            request=request,
        )

        return Response(RadiologyReferralDispatchSerializer(dispatch).data)

    @extend_schema(tags=["Radiology"], summary="Dispatches/(?P<dispatch pk>[^/.]+)/referral letter", description="Download the referral letter PDF for a specific dispatch.", parameters=ORDER_DISPATCH_PK_PARAMS)
    @action(detail=True, methods=['get'], url_path='dispatches/(?P<dispatch_pk>[^/.]+)/referral_letter')
    def dispatch_referral_letter(self, request, pk=None, dispatch_pk=None):
        """Download the referral letter PDF for a specific dispatch."""
        order = self.get_object()
        try:
            dispatch = order.dispatches.get(id=dispatch_pk)
        except RadiologyReferralDispatch.DoesNotExist:
            return Response({'error': 'Dispatch not found'}, status=status.HTTP_404_NOT_FOUND)

        from .dispatch_pdfs import build_referral_letter_pdf

        pdf_bytes = build_referral_letter_pdf(dispatch)
        if not dispatch.referral_letter_printed_at:
            dispatch.referral_letter_printed_at = timezone.now()
            dispatch.save(update_fields=['referral_letter_printed_at'])

        filename = f"radiology_referral_{dispatch.dispatch_id}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @extend_schema(tags=["Radiology"], summary="Dispatches/(?P<dispatch pk>[^/.]+)/responsibility form", description="Download the financial-responsibility form PDF for a specific dispatch.", parameters=ORDER_DISPATCH_PK_PARAMS)
    @action(detail=True, methods=['get'], url_path='dispatches/(?P<dispatch_pk>[^/.]+)/responsibility_form')
    def dispatch_responsibility_form(self, request, pk=None, dispatch_pk=None):
        """Download the financial-responsibility form PDF for a specific dispatch."""
        order = self.get_object()
        try:
            dispatch = order.dispatches.get(id=dispatch_pk)
        except RadiologyReferralDispatch.DoesNotExist:
            return Response({'error': 'Dispatch not found'}, status=status.HTTP_404_NOT_FOUND)

        from .dispatch_pdfs import build_responsibility_form_pdf

        pdf_bytes = build_responsibility_form_pdf(dispatch)
        if not dispatch.responsibility_form_printed_at:
            dispatch.responsibility_form_printed_at = timezone.now()
            dispatch.save(update_fields=['responsibility_form_printed_at'])

        filename = f"radiology_responsibility_{dispatch.dispatch_id}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


@document_viewset(tag="Radiology", resource="radiology studies")
class RadiologyStudyViewSet(LabRadiologyScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing individual radiology studies (like lab tests)."""

    facility_filter_field = 'order__processing_clinic'
    facility_scope_fields = ('order__location_clinic', 'order__processing_clinic', 'processing_clinic')
    # Legacy/external studies (order with no facility) stay visible to everyone,
    # matching RadiologyOrderViewSet and the lab test/results viewsets.
    include_unassigned_scope = True
    serializer_class = RadiologyStudySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'processing_method', 'modality']
    search_fields = ['procedure', 'body_part']
    ordering_fields = ['created_at', 'scheduled_date']
    ordering = ['-created_at']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return RadiologyStudy.objects.none()
        
        return self.scope_queryset(
            RadiologyStudy.objects.all().select_related(
                'order', 'order__patient', 'order__doctor', 'template',
                'processing_clinic', 'order__location_clinic', 'order__processing_clinic',
                'scheduled_by', 'acquired_by', 'reported_by', 'verified_by'
            )
        )

    @extend_schema(tags=["Radiology"], summary="Update status", description="Update study status (like lab test status).")
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

    @extend_schema(tags=["Radiology"], summary="Update results", description="Update study results (like lab test results).")
    @action(detail=True, methods=['post'])
    def update_results(self, request, pk=None):
        """Update study results (like lab test results)."""
        # Handle FormData (multipart/form-data) vs JSON
        if request.content_type and 'multipart/form-data' in request.content_type:
            # For FormData, get values from request.POST
            report = request.POST.get('report', '')
            legacy_findings = request.POST.get('findings', '')
            legacy_impression = request.POST.get('impression', '')
            custom_reports = _parse_custom_reports(request.POST.get('custom_reports'))
            critical_str = request.POST.get('critical', 'false')
            critical = critical_str.lower() in ('true', '1', 'yes', 'on')
            status_update = request.POST.get('status')
        else:
            # For JSON, get values from request.data
            report = request.data.get('report', '')
            legacy_findings = request.data.get('findings', '')
            legacy_impression = request.data.get('impression', '')
            custom_reports = _parse_custom_reports(request.data.get('custom_reports'))
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
            if custom_reports:
                custom_summary = _summarize_custom_reports(custom_reports)
                if custom_summary:
                    merged_report = f"{merged_report}\n\n{custom_summary}".strip() if merged_report else custom_summary

            study.report = merged_report
            study.custom_reports = custom_reports
            study.critical = critical or any(bool(row.get('critical')) for row in custom_reports if isinstance(row, dict))

            old_status = study.status
            if status_update:
                study.status = status_update

                # Set reporting timestamps
                if status_update == 'reported' and not study.reported_by:
                    study.reported_by = request.user
                    study.reported_at = timezone.now()
                    logger.debug("Set reported_by to %s", request.user.get_full_name())

            # Handle file uploads (multiple files via indexed keys)
            report_file_count = int(request.POST.get('report_file_count', 0))
            if report_file_count > 0:
                report_files = [request.FILES.get(f'report_file_{i}') for i in range(report_file_count)]
                report_files = [f for f in report_files if f]
                if report_files:
                    study.report_file = report_files[0]
                    logger.debug("Primary file assigned to study %s: %s", study.id, report_files[0].name)
                    for f in report_files[1:]:
                        RadiologyStudyReportAttachment.objects.create(
                            study=study,
                            row_id='',
                            row_name=f.name[:200],
                            file=f,
                            uploaded_by=request.user,
                        )
                        logger.debug("Additional file saved as attachment: %s", f.name)
            else:
                logger.debug("No report_file in request.FILES")

            study.save()
            for row in custom_reports:
                if not isinstance(row, dict):
                    continue
                row_id = str(row.get('id') or '').strip()
                if not row_id:
                    continue
                file_obj = request.FILES.get(f'custom_report_file_{row_id}')
                if not file_obj:
                    continue
                RadiologyStudyReportAttachment.objects.create(
                    study=study,
                    row_id=row_id,
                    row_name=str(row.get('procedure') or row.get('name') or '')[:200],
                    file=file_obj,
                    uploaded_by=request.user,
                )
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

    @extend_schema(tags=["Radiology"], summary="Reject", description="Reject a study and send back for revision.")
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

    @extend_schema(tags=["Radiology"], summary="Create reports for reported studies", description="Create RadiologyReport records for all studies with 'reported' status that don't have them.")
    @action(detail=False, methods=['post'])
    def create_reports_for_reported_studies(self, request):
        """Create RadiologyReport records for all studies with 'reported' status that don't have them."""
        reported_studies = self.scope_queryset(
            RadiologyStudy.objects.filter(status='reported')
        )
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


@document_viewset(tag="Radiology", resource="radiology reports", read_only=True)
class RadiologyReportViewSet(FacilityScopedMixin, viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing radiology reports awaiting verification."""

    facility_filter_field = 'order__processing_clinic'
    facility_scope_fields = (
        'order__location_clinic',
        'order__processing_clinic',
        'study__processing_clinic',
    )
    # Legacy/external orders (no facility) stay visible to everyone, matching
    # LabResultViewSet and the radiology study/order viewsets.
    include_unassigned_scope = True
    serializer_class = RadiologyReportSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'overall_status', 'priority']
    search_fields = [
        'order__order_id',
        'study__procedure',
        'patient__first_name',
        'patient__surname',
        'patient__patient_id',
    ]
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def list(self, request, *args, **kwargs):
        logger.debug("RadiologyReportViewSet.list() called")
        return super().list(request, *args, **kwargs)
    
    def get_queryset(self):
        # Filter by status if provided, default to 'reported' for pending verifications
        if getattr(self, 'swagger_fake_view', False):
            return RadiologyReport.objects.none()
        
        status_filter = self.request.query_params.get('status', 'reported')

        queryset = RadiologyReport.objects.select_related('study', 'order', 'patient', 'order__doctor', 'study__reported_by')

        if status_filter == 'reported':
            queryset = queryset.filter(study__status='reported')
        elif status_filter == 'verified':
            queryset = queryset.filter(study__status='verified')
        elif status_filter == 'all':
            queryset = queryset.filter(study__status__in=['reported', 'verified'])

        clinic = self.request.query_params.get('clinic')
        if clinic:
            queryset = queryset.filter(order__clinic=clinic)
        location_clinic_id = _parse_location_clinic_id(self.request)
        if location_clinic_id is not None:
            queryset = queryset.filter(order__location_clinic_id=location_clinic_id)
        gender = self.request.query_params.get('gender')
        if gender in ('male', 'female'):
            queryset = queryset.filter(patient__gender=gender)
        processing_method = self.request.query_params.get('processing_method')
        if processing_method in ('in_house', 'outsourced'):
            queryset = queryset.filter(study__processing_method=processing_method)
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(study__modality__iexact=category)

        exact_date = self.request.query_params.get('date')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        date_field = 'study__reported_at__date' if status_filter != 'verified' else 'study__verified_at__date'
        if exact_date:
            queryset = queryset.filter(**{date_field: exact_date})
        else:
            if start_date:
                queryset = queryset.filter(**{f'{date_field}__gte': start_date})
            if end_date:
                queryset = queryset.filter(**{f'{date_field}__lte': end_date})

        return self.scope_queryset(queryset)

    @extend_schema(tags=["Radiology"], summary="Stats")
    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        qs = self.filter_queryset(self.get_queryset())
        summary = qs.aggregate(
            total=Count('id'),
            normal=Count('id', filter=Q(overall_status='normal')),
            abnormal=Count('id', filter=Q(overall_status='abnormal')),
            critical=Count('id', filter=Q(overall_status='critical')),
        )
        return Response({
            'total': summary.get('total', 0) or 0,
            'normal': summary.get('normal', 0) or 0,
            'abnormal': summary.get('abnormal', 0) or 0,
            'critical': summary.get('critical', 0) or 0,
        })
    
    @extend_schema(tags=["Radiology"], summary="Verify", description="Verify a radiology report.")
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """Verify a radiology report."""
        ensure_capability(
            request.user,
            "radiology_result_verify",
            "Only authorised radiology staff can verify reports.",
        )
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
    
    @extend_schema(tags=["Radiology"], summary="Reject", description="Reject a radiology report and send back for revision.")
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
