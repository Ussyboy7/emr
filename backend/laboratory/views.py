"""
Views for the Laboratory app.
"""
from rest_framework import viewsets, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.utils import timezone
from django.db import transaction
from django.db.models import BooleanField, Count, Q, Max
from django.db.models.expressions import RawSQL
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from organization.models import Clinic, SystemConfig
from organization.routing import ensure_internal_processing_destination
from io import BytesIO
import json
import re

# PDF generation
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

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
    if not assigned.intersection(order_facility_ids):
        raise PermissionDenied('You are not assigned to this order facility.')


def _resolve_collection_clinic(user, order):
    """Resolve an omitted collection clinic consistently for legacy actions."""
    return (
        getattr(user, 'active_clinic', None)
        or getattr(user, 'location_clinic', None)
        or user.location_clinics.order_by('pk').first()
        or order.location_clinic
        or order.processing_clinic
        or Clinic.objects.filter(is_active=True).first()
    )


def _collection_accession_prefix(clinic):
    code = re.sub(r'[^A-Z0-9]+', '-', (clinic.code or '').upper()).strip('-')
    canonical_prefixes = {
        'BODE-THOMAS': 'BT',
        'TINCAN': 'TCIN',
    }
    if code in canonical_prefixes:
        return canonical_prefixes[code]
    # LabTest.lab_number is a legacy varchar(20): 12 code chars + -YY-NNNN.
    return (code or 'CLINIC')[:12]


def _next_collection_accession(clinic):
    """Allocate a facility/year serial while the caller holds the clinic lock."""
    current_year = timezone.now().year % 100
    year_prefix = f'{_collection_accession_prefix(clinic)}-{current_year:02d}-'
    last_accession = (
        LabSampleBatch.objects
        .filter(accession_number__startswith=year_prefix)
        .order_by('-accession_number')
        .values_list('accession_number', flat=True)
        .first()
    )
    try:
        serial = int(last_accession.rsplit('-', 1)[-1]) + 1 if last_accession else 1
    except (TypeError, ValueError):
        serial = 1
    return f'{year_prefix}{serial:04d}'


from .models import (
    LabTemplate,
    LabPartner,
    LabOrder,
    LabTest,
    LabSampleBatch,
    LabTestRoutingEvent,
    LabTestResultAttachment,
    LabReferralDispatch,
    LabResult,
    TemplateFieldOption,
)
from .serializers import (
    LabTemplateSerializer,
    LabPartnerSerializer,
    LabOrderSerializer,
    LabTestSerializer,
    LabSampleBatchSerializer,
    LabTestRoutingEventSerializer,
    LabReferralDispatchSerializer,
    LabResultSerializer,
    TemplateFieldOptionSerializer,
    OTHER_TEMPLATE_CODES,
)
from common.mixins import FacilityScopedMixin, LabRadiologyScopedMixin
from common.openapi import ORDER_DISPATCH_ID_PARAMS, document_viewset
from permissions.user_capabilities import ensure_capability, user_has_capability
from .pagination import FlexiblePageNumberPagination, LabCatalogPagination
from .result_display import dedupe_result_alias_rows, sort_lab_result_rows_for_pdf
from audit.services import AuditService


def _has_meaningful_results_payload(payload) -> bool:
    """
    True only when at least one result value is clinically meaningful.
    Empty strings/null/empty containers are treated as no result.
    """
    if not isinstance(payload, dict) or not payload:
        return False

    for value in payload.values():
        if value is None:
            continue
        if isinstance(value, str):
            if value.strip():
                return True
            continue
        if isinstance(value, (list, tuple, set, dict)):
            if len(value) > 0:
                return True
            continue
        return True
    return False


def _parse_results_payload(results):
    if isinstance(results, str):
        try:
            parsed = json.loads(results)
            if isinstance(parsed, dict):
                return parsed
            if isinstance(parsed, list):
                return {'custom_results': parsed}
            return {'Result': parsed} if parsed not in (None, '') else {}
        except json.JSONDecodeError:
            return {'Result': results} if results.strip() else {}
    if isinstance(results, list):
        return {'custom_results': results}
    return results


@document_viewset(tag="Laboratory", resource="lab partners")
class LabPartnerViewSet(viewsets.ModelViewSet):
    """CRUD for outsourced lab partners (dropdown + Django admin)."""
    serializer_class = LabPartnerSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "code", "email"]
    ordering_fields = ["sort_order", "name", "created_at"]
    ordering = ["sort_order", "name"]
    # Small catalog: return a plain JSON array (avoids pagination quirks in clients).
    pagination_class = None

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return LabPartner.objects.none()
        
        return LabPartner.objects.all()


@document_viewset(tag="Laboratory", resource="lab templates")
class LabTemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for managing lab templates."""
    serializer_class = LabTemplateSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['sample_type', 'is_active', 'code', 'category']
    search_fields = ['name', 'code']
    ordering_fields = ['sort_order', 'name', 'code']
    ordering = ['sort_order', 'name']
    pagination_class = LabCatalogPagination
    
    def get_queryset(self):
        # Return all templates (not just active) to allow status management
        if getattr(self, 'swagger_fake_view', False):
            return LabTemplate.objects.none()
        
        return LabTemplate.objects.all()
    
    @extend_schema(tags=["Laboratory"], summary="Reorder", description="Bulk-update sort_order for templates.")
    @action(detail=False, methods=['patch'], url_path='reorder')
    def reorder(self, request):
        """Bulk-update sort_order for templates.
        Accepts: {"orders": [{"id": 1, "sort_order": 0}, ...]}
        """
        orders = request.data.get('orders', [])
        if not orders:
            return Response({'error': 'No orders provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        ids = [o['id'] for o in orders]
        existing = set(LabTemplate.objects.filter(id__in=ids).values_list('id', flat=True))
        
        for o in orders:
            if o['id'] in existing:
                LabTemplate.objects.filter(id=o['id']).update(sort_order=o.get('sort_order', 0))
        
        return Response({'status': 'ok'})

    @extend_schema(tags=["Laboratory"], summary="Resolve", description="Return a single template by exact code (no paginated list hop).")
    @action(detail=False, methods=['get'], url_path='resolve')
    def resolve_template(self, request):
        """Return a single template by exact code (no paginated list hop)."""
        from common.diagnostic_catalog import resolve_catalog_template_by_code

        code = request.query_params.get('code') or ''
        data, error = resolve_catalog_template_by_code(
            self.get_queryset(),
            code,
            LabTemplateSerializer,
        )
        if error is not None:
            return error
        return Response(data)

    @extend_schema(tags=["Laboratory"], summary="List stats", description="Template tab counts in one request.")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Template tab counts in one request."""
        from common.diagnostic_catalog import build_catalog_list_stats

        categories = ['chemistry', 'hematology', 'microbiology', 'serology', 'toxicology']
        return Response(build_catalog_list_stats(LabTemplate.objects.all(), categories))


@extend_schema_view(
    list=extend_schema(summary="List lab orders", tags=["Laboratory"]),
    retrieve=extend_schema(summary="Retrieve lab order", tags=["Laboratory"]),
    create=extend_schema(summary="Create lab order", tags=["Laboratory"]),
    update=extend_schema(summary="Update lab order", tags=["Laboratory"]),
    partial_update=extend_schema(summary="Partially update lab order", tags=["Laboratory"]),
    destroy=extend_schema(summary="Delete lab order", tags=["Laboratory"]),
)
class LabOrderViewSet(LabRadiologyScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing lab orders."""
    serializer_class = LabOrderSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'doctor', 'priority', 'consultation_session', 'visit', 'source_type', 'external_clinic', 'location_clinic']
    facility_scope_fields = ('location_clinic', 'processing_clinic', 'tests__processing_clinic')
    include_unassigned_scope = True
    search_fields = [
        'order_id',
        'clinical_notes',
        'lab_number',
        'tests__lab_number',
        'external_requesting_doctor_name',
        'manual_request_reference',
        'external_clinic__name',
        'patient__first_name',
        'patient__surname',
        'patient__patient_id',
    ]
    ordering_fields = ['ordered_at']
    ordering = ['-ordered_at']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return LabOrder.objects.none()
        
        qs = (
            LabOrder.objects.all()
            .select_related(
                'patient', 'doctor', 'visit', 'consultation_session', 'created_by',
                'external_clinic', 'location_clinic', 'processing_clinic',
            )
            .prefetch_related(
                'tests',
                'consultation_session__diagnoses__icd10_code',
                'visit__diagnoses__icd10_code',
            )
        )
        pm = self.request.query_params.get('processing_method')
        if pm in ('in_house', 'outsourced'):
            qs = qs.filter(tests__processing_method=pm).distinct()

        # Date filtering — defaults to the order timestamp, but callers can
        # ask for filtering on the test rejection timestamp instead
        # (e.g. the "Rework Required" tab, which wants "today's rejections"
        # regardless of when the order was originally placed).
        date = self.request.query_params.get('date')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        date_field = self.request.query_params.get('date_field')
        if date_field == 'rejected_at':
            date_lookup = 'tests__rejected_at__date'
        else:
            date_lookup = 'ordered_at__date'
        if date:
            qs = qs.filter(**{date_lookup: date}).distinct()
        elif start_date:
            qs = qs.filter(**{f'{date_lookup}__gte': start_date})
            if end_date:
                qs = qs.filter(**{f'{date_lookup}__lte': end_date})
            qs = qs.distinct()
        elif end_date:
            qs = qs.filter(**{f'{date_lookup}__lte': end_date}).distinct()

        # Gender filtering (stored on Patient.gender)
        gender = self.request.query_params.get('gender')
        if gender:
            qs = qs.filter(patient__gender=gender)
        source_type = self.request.query_params.get('source_type')
        if source_type in ('internal_emr', 'external_manual'):
            qs = qs.filter(source_type=source_type)
        processing_clinic_id = self.request.query_params.get('processing_clinic')
        if processing_clinic_id:
            qs = qs.filter(
                Q(processing_clinic_id=processing_clinic_id)
                | Q(tests__processing_clinic_id=processing_clinic_id)
            ).distinct()

        location_clinic_id = _parse_location_clinic_id(self.request)
        if location_clinic_id is not None:
            qs = qs.filter(location_clinic_id=location_clinic_id)

        workflow_tab = self.request.query_params.get('workflow_tab')
        if workflow_tab == 'pending':
            qs = qs.filter(tests__status='pending').distinct()
        elif workflow_tab == 'processing':
            qs = qs.filter(
                Q(tests__status='sample_collected') | Q(tests__status='processing')
            ).distinct()
        elif workflow_tab in ('results', 'results_ready'):
            qs = qs.filter(tests__status='results_ready').distinct()
        elif workflow_tab == 'rejected':
            qs = qs.filter(tests__status='rejected').distinct()

        return self.scope_queryset(qs)

    @extend_schema(tags=["Laboratory"], summary="Stats", description="Server-side counts for lab order dashboard cards/tabs.")
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Server-side counts for lab order dashboard cards/tabs.

        Date semantics:
          - All counts except ``rework_required`` are scoped by ``ordered_at``
            (when the caller supplied a date / range).
          - ``rework_required`` is scoped by ``tests__rejected_at`` so that
            "Today" on the Rework Required card reflects today's rejections
            regardless of when the underlying orders were originally placed.
          - We deliberately ignore any ``date_field=rejected_at`` the list
            endpoint uses, so cards stay semantically consistent across tabs.
        """
        date = request.query_params.get('date')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        # Build a base queryset with the non-date filters applied but neither
        # date field applied, so we can fan it out into two scopes below.
        base_qs = (
            LabOrder.objects.all()
            .select_related(
                'patient', 'doctor', 'visit', 'consultation_session', 'created_by',
                'external_clinic', 'location_clinic', 'processing_clinic',
            )
            .prefetch_related('tests')
        )
        pm = request.query_params.get('processing_method')
        if pm in ('in_house', 'outsourced'):
            base_qs = base_qs.filter(tests__processing_method=pm).distinct()
        gender = request.query_params.get('gender')
        if gender:
            base_qs = base_qs.filter(patient__gender=gender)
        source_type = request.query_params.get('source_type')
        if source_type in ('internal_emr', 'external_manual'):
            base_qs = base_qs.filter(source_type=source_type)
        processing_clinic_id = request.query_params.get('processing_clinic')
        if processing_clinic_id:
            base_qs = base_qs.filter(
                Q(processing_clinic_id=processing_clinic_id)
                | Q(tests__processing_clinic_id=processing_clinic_id)
            ).distinct()
        location_clinic_id = _parse_location_clinic_id(request)
        if location_clinic_id is not None:
            base_qs = base_qs.filter(location_clinic_id=location_clinic_id)
        # Apply DRF's generic filters (search, filterset_fields, ordering).
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
        rejected_scoped = with_date(base_qs, 'tests__rejected_at')

        agg = ordered_scoped.aggregate(
            total=Count('id', distinct=True),
            pending=Count('id', filter=Q(tests__status='pending'), distinct=True),
            processing=Count(
                'id',
                filter=Q(tests__status='sample_collected') | Q(tests__status='processing'),
                distinct=True,
            ),
            results_ready=Count('id', filter=Q(tests__status='results_ready'), distinct=True),
            stat=Count(
                'id',
                filter=Q(priority='stat') & ~Q(tests__status='verified'),
                distinct=True,
            ),
        )
        rework_required = (
            rejected_scoped.filter(tests__status='rejected').distinct().count()
        )

        return Response(
            {
                'total': agg.get('total', 0) or 0,
                'pending': agg.get('pending', 0) or 0,
                'processing': agg.get('processing', 0) or 0,
                'results_ready': agg.get('results_ready', 0) or 0,
                'rework_required': rework_required,
                'stat': agg.get('stat', 0) or 0,
            }
        )
    
    def create(self, request, *args, **kwargs):
        data = request.data.dict() if hasattr(request.data, 'dict') else dict(request.data)
        if 'manual_request_file' in request.FILES:
            data['manual_request_file'] = request.FILES['manual_request_file']

        tests_data = data.get('tests_data')
        if isinstance(tests_data, str):
            try:
                parsed_tests = json.loads(tests_data)
                if isinstance(parsed_tests, list):
                    data['tests_data'] = parsed_tests
            except json.JSONDecodeError:
                return Response(
                    {'tests_data': 'Invalid tests_data JSON payload.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        self.auto_set_facility(serializer)
        # Set the doctor field using multiple fallback strategies
        data = serializer.validated_data.copy()
        if data.get('source_type') != 'external_manual' and ('doctor' not in data or data['doctor'] is None):
            doctor = self._find_doctor_for_order(data)
            if doctor:
                data['doctor'] = doctor

        order = serializer.save(created_by=self.request.user, **data)

        # Log audit
        try:
            doctor_name = (
                order.external_requesting_doctor_name
                if order.source_type == 'external_manual'
                else (order.doctor.get_full_name() if order.doctor else 'Unknown')
            )
            AuditService.log_lab_action(
                user=self.request.user,
                action='create',
                lab_order=order,
                module='laboratory',
                description=f'Created lab order {order.order_id} for patient {order.patient.get_full_name()} by Dr. {doctor_name}',
                request=self.request,
            )
        except Exception:
            # Audit logging must never block order creation
            pass

        # Notify Laboratory (doctor -> laboratory). STAT orders escalate
        # the notification priority so the bell + toast + sound matches
        # the clinical urgency, instead of every order looking the same.
        try:
            from notifications.services import NotificationService, priority_from_lab_or_radiology

            patient_name = order.patient.get_full_name()
            order_priority = getattr(order, 'priority', 'routine')
            notif_priority = priority_from_lab_or_radiology(order_priority)
            stat_prefix = "STAT — " if notif_priority == 'urgent' else ''
            title = f"{stat_prefix}New lab order"
            if order.source_type == 'external_manual':
                clinic_name = order.external_clinic.name if order.external_clinic else 'external clinic'
                message = f"External lab request {order.order_id} for {patient_name} from {clinic_name} is ready for Laboratory."
            else:
                message = f"Lab order {order.order_id} for {patient_name} is ready for Laboratory."

            NotificationService.notify_role(
                role_name='Laboratory Scientist',
                title=title,
                message=message,
                notification_type='lab_result',
                priority=notif_priority,
                action_url="/laboratory/orders",
                object_type='lab_order',
                object_id=str(order.id),
                clinic_id=getattr(self.request.user, 'clinic_id', None),
            )
        except Exception:
            # Notifications must never break lab order creation
            pass

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
    
    @extend_schema(tags=["Laboratory"], summary="Generate lab number", description="Generate Lab ID (BT-YY-NNNN) for a test. Used when patient comes to lab and sample is collected.")
    @action(detail=True, methods=['post'])
    def generate_lab_number(self, request, pk=None):
        """Generate Lab ID (BT-YY-NNNN) for a test. Used when patient comes to lab and sample is collected.
        One Lab ID per order: all tests in the order share the same Lab ID when collected together."""
        order = self.get_object()
        test_id = request.data.get('test_id')

        try:
            test = order.tests.get(id=test_id)
            collection_clinic_id = request.data.get('collection_clinic')
            collection_clinic = (
                get_object_or_404(Clinic, pk=collection_clinic_id)
                if collection_clinic_id is not None
                else None
            )
            collection_response = self._collect_samples(
                request,
                order,
                test_ids=[test.pk],
                collection_clinic=collection_clinic,
                idempotent=True,
                response_shape='batch',
            )
            if collection_response.status_code != status.HTTP_200_OK:
                return collection_response
            return Response(collection_response.data['tests'][0])
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(tags=["Laboratory"], summary="Collect samples", description="Collect samples for selected tests and generate one facility accession per physical batch.")
    @action(detail=True, methods=['post'])
    def collect_samples(self, request, pk=None):
        """Collect selected tests as one physical sample batch with a facility accession."""
        return self._collect_samples(request, self.get_object(), response_shape='legacy')

    @action(detail=True, methods=['post'], url_path='collect-samples')
    def collect_samples_batch(self, request, pk=None):
        return self._collect_samples(request, self.get_object(), response_shape='batch')

    def _collect_samples(
        self,
        request,
        order,
        *,
        test_ids=None,
        collection_clinic=None,
        idempotent=False,
        response_shape='batch',
    ):
        ensure_capability(
            request.user,
            'lab_collect',
            'Only authorised laboratory staff can collect samples.',
        )
        _ensure_order_facility_access(request.user, order)
        test_ids = request.data.get('test_ids', []) if test_ids is None else test_ids
        collection_method = request.data.get('collection_method', '')
        notes = request.data.get('notes', '')
        collection_clinic_id = request.data.get('collection_clinic')

        if not test_ids:
            return Response({'error': 'No tests specified'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Ensure test_ids are integers
            test_ids = [int(tid) for tid in test_ids]
            if collection_clinic is None and collection_clinic_id is None:
                collection_clinic = _resolve_collection_clinic(request.user, order)
                if collection_clinic is None:
                    collection_clinic, _ = Clinic.objects.get_or_create(
                        code='DEFAULT-COLLECTION',
                        defaults={'name': 'Default Collection Facility'},
                    )
            elif collection_clinic is None:
                collection_clinic = get_object_or_404(Clinic, pk=collection_clinic_id)
            _ensure_route_facility_access(request.user, collection_clinic)

            with transaction.atomic():
                order = LabOrder.objects.select_for_update().get(pk=order.pk)
                tests = list(
                    LabTest.objects.select_for_update().filter(order=order, id__in=test_ids)
                )
                if len(tests) != len(set(test_ids)):
                    return Response({'error': 'Some tests are not part of this order'}, status=status.HTTP_400_BAD_REQUEST)
                collection_clinic = Clinic.objects.select_for_update().get(
                    pk=collection_clinic.pk
                )

                already_collected = [test for test in tests if test.sample_batch_id]
                if already_collected and not idempotent:
                    return Response(
                        {'error': 'One or more tests are already assigned to a sample batch.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if idempotent and len(tests) == 1 and tests[0].sample_batch_id:
                    batch = LabSampleBatch.objects.select_for_update().get(
                        pk=tests[0].sample_batch_id
                    )
                    return self._collection_response(batch, tests, response_shape)

                legacy_lab_number = (
                    tests[0].lab_number
                    if idempotent and len(tests) == 1 and not tests[0].sample_batch_id
                    else None
                )
                # One Lab ID per order: if a prior collection already created a
                # batch for this order, reuse it (and its accession) instead of
                # minting a fresh serial for a later collection event.
                existing_order_batch = (
                    order.sample_batches.select_for_update()
                    .order_by("collected_at", "id")
                    .first()
                )
                if legacy_lab_number:
                    batch = order.sample_batches.filter(
                        accession_number=legacy_lab_number,
                        collection_clinic=collection_clinic,
                    ).first()
                    if batch is None:
                        batch = LabSampleBatch.objects.create(
                            accession_number=legacy_lab_number,
                            order=order,
                            collection_clinic=collection_clinic,
                            collected_by=request.user,
                            collected_at=timezone.now(),
                            notes=notes,
                        )
                    shared_lab_number = legacy_lab_number
                elif existing_order_batch is not None:
                    batch = existing_order_batch
                    shared_lab_number = existing_order_batch.accession_number
                else:
                    shared_lab_number = _next_collection_accession(collection_clinic)
                    batch = LabSampleBatch.objects.create(
                        accession_number=shared_lab_number,
                        order=order,
                        collection_clinic=collection_clinic,
                        collected_by=request.user,
                        collected_at=timezone.now(),
                        notes=notes,
                    )
                collected_at = timezone.now()

                updated_tests = []
                for test in tests:
                    if not test.lab_number:
                        test.lab_number = shared_lab_number
                    test.sample_batch = batch
                    test.status = 'sample_collected'
                    test.collected_by = request.user
                    test.collected_at = collected_at

                    # Store collection method and notes
                    collection_info = []
                    collection_info.append(f"Lab ID: {shared_lab_number}")
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

            return self._collection_response(batch, updated_tests, response_shape)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @staticmethod
    def _collection_response(batch, tests, response_shape):
        serialized_tests = LabTestSerializer(tests, many=True).data
        if response_shape == 'legacy':
            return Response(serialized_tests)
        return Response({
            'sample_batch': LabSampleBatchSerializer(batch).data,
            'tests': serialized_tests,
        })

    @action(detail=True, methods=['post'], url_path='route-tests')
    def route_tests(self, request, pk=None):
        if not (user_has_capability(request.user, 'lab_collect') or user_has_capability(request.user, 'lab_process')):
            ensure_capability(request.user, 'lab_process', 'Only authorised laboratory staff can route tests.')
        order = self.get_object()
        test_ids = request.data.get('test_ids') or []
        destination_type = request.data.get('destination_type')
        if not isinstance(test_ids, list) or not test_ids:
            return Response({'error': 'test_ids must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)
        if destination_type not in ('internal', 'external'):
            return Response({'error': 'destination_type must be internal or external'}, status=status.HTTP_400_BAD_REQUEST)

        external_destination = (request.data.get('external_destination') or '').strip()
        processing_clinic_id = request.data.get('processing_clinic')
        if destination_type == 'external' and not external_destination:
            return Response({'error': 'external_destination is required'}, status=status.HTTP_400_BAD_REQUEST)
        if destination_type == 'internal' and not processing_clinic_id:
            return Response({'error': 'processing_clinic is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            test_ids = [int(test_id) for test_id in test_ids]
            processing_clinic = None
            if destination_type == 'internal':
                processing_clinic = get_object_or_404(Clinic, pk=processing_clinic_id)
                _ensure_route_facility_access(request.user, processing_clinic)
            with transaction.atomic():
                locked_order = LabOrder.objects.select_for_update().get(pk=order.pk)
                if destination_type == 'internal':
                    ensure_internal_processing_destination(locked_order.location_clinic, processing_clinic)
                _ensure_route_facility_access(request.user, locked_order.location_clinic)
                tests = list(LabTest.objects.select_for_update().filter(order=locked_order, id__in=test_ids))
                if len(tests) != len(set(test_ids)):
                    return Response({'error': 'Some tests are not part of this order'}, status=status.HTTP_400_BAD_REQUEST)
                non_routeable = [
                    test for test in tests
                    if test.status in ('results_ready', 'verified', 'rejected')
                    or test.routing_status == 'cancelled'
                ]
                if non_routeable:
                    return Response(
                        {'error': 'These tests can no longer be routed: ' + ', '.join(
                            f'{test.code} ({test.status}/{test.routing_status})' for test in non_routeable
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
                        status='issued', tests__in=tests,
                    ).values_list('id', flat=True).distinct()
                    issued_dispatches = list(
                        locked_order.dispatches.select_for_update().filter(id__in=issued_dispatch_ids)
                    )
                    for dispatch in issued_dispatches:
                        dispatch_test_ids = set(dispatch.tests.values_list('id', flat=True))
                        remaining_test_ids = dispatch_test_ids - {test.id for test in tests}
                        if remaining_test_ids:
                            replacement = LabReferralDispatch.objects.create(
                                order=locked_order,
                                partner=dispatch.partner,
                                partner_name=dispatch.partner_name,
                                partner_address_snapshot=dispatch.partner_address_snapshot,
                                notes=dispatch.notes,
                                issued_by=dispatch.issued_by,
                            )
                            replacement.tests.set(LabTest.objects.filter(id__in=remaining_test_ids))
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
                            user=request.user, action='update', object_type='lab_referral_dispatch',
                            object_id=str(dispatch.id), module='laboratory',
                            object_repr=dispatch.dispatch_id,
                            description=f'{new_status.title()} dispatch {dispatch.dispatch_id} for internal reroute',
                            new_values={
                                'status': new_status,
                                'cancellation_reason': dispatch.cancellation_reason,
                            },
                            metadata={'order_id': locked_order.order_id}, request=request,
                        )
                events = []
                for test in tests:
                    event = LabTestRoutingEvent.objects.create(
                        test=test,
                        from_clinic=test.processing_clinic,
                        to_clinic=processing_clinic,
                        destination_type=destination_type,
                        external_destination=external_destination,
                        reason=reason,
                        changed_by=request.user,
                    )
                    test.processing_clinic = processing_clinic
                    test.routing_status = 'referred_external' if destination_type == 'external' else 'sent_to_processing'
                    if destination_type == 'external':
                        test.processing_method = 'outsourced'
                        test.outsourced_lab = external_destination
                        test.status = 'processing'
                        test.processed_by = request.user
                        test.processed_at = timezone.now()
                    else:
                        test.processing_method = 'in_house'
                        test.outsourced_lab = ''
                        test.processed_by = None
                        test.processed_at = None
                    update_fields = ['processing_clinic', 'routing_status', 'updated_at']
                    if destination_type == 'external':
                        update_fields.extend([
                            'processing_method', 'outsourced_lab', 'status',
                            'processed_by', 'processed_at',
                        ])
                    else:
                        update_fields.extend([
                            'processing_method', 'outsourced_lab', 'processed_by', 'processed_at',
                        ])
                    test.save(update_fields=update_fields)
                    events.append(event)

                dispatch = None
                if destination_type == 'external':
                    dispatch = LabReferralDispatch.objects.create(
                        order=locked_order,
                        partner_name=external_destination,
                        issued_by=request.user,
                        notes=(request.data.get('reason') or '').strip(),
                    )
                    dispatch.tests.set(tests)
                AuditService.log_activity(
                    user=request.user, action='update', object_type='lab_test_routing',
                    object_id=str(locked_order.pk), module='laboratory',
                    object_repr=locked_order.order_id,
                    description=f'Routed {len(tests)} test(s) from {locked_order.order_id}',
                    new_values={'test_ids': test_ids, 'destination_type': destination_type},
                    request=request,
                )
            payload = {
                'lines': LabTestSerializer(tests, many=True).data,
                'routing_events': LabTestRoutingEventSerializer(events, many=True).data,
            }
            if dispatch:
                payload['dispatch'] = LabReferralDispatchSerializer(dispatch).data
            return Response(payload)
        except ValueError:
            return Response({'error': 'test_ids must contain integers'}, status=status.HTTP_400_BAD_REQUEST)
    
    @extend_schema(tags=["Laboratory"], summary="Process", description="Mark test as processing.")
    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        """Mark test as processing."""
        ensure_capability(request.user, 'lab_process', 'Only authorised laboratory staff can process tests.')
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

    # ------------------------------------------------------------------
    # Outsourced dispatch (Phase 2)
    # ------------------------------------------------------------------

    @extend_schema(tags=["Laboratory"], summary="Dispatches", description="List every LabReferralDispatch ever issued for this order (most recent first).")
    @action(detail=True, methods=['get'], url_path='dispatches')
    def list_dispatches(self, request, pk=None):
        """List every LabReferralDispatch ever issued for this order (most recent first)."""
        order = self.get_object()
        dispatches = order.dispatches.all().prefetch_related('tests')
        return Response(LabReferralDispatchSerializer(dispatches, many=True).data)

    @extend_schema(tags=["Laboratory"], summary="Dispatch outsourced", description="Send a batch of tests in this order to one external lab partner.")
    @action(detail=True, methods=['post'], url_path='dispatch_outsourced')
    @transaction.atomic
    def dispatch_outsourced(self, request, pk=None):
        """
        Send a batch of tests in this order to one external lab partner.

        body: {
          test_ids: number[]                 # tests in this order to dispatch
          partner_id?: number                # preferred — FK to LabPartner
          partner_name?: string              # required when partner_id is missing
                                             # (ad-hoc 'Other' partner)
          notes?: string                     # optional dispatch-level notes
          supersede_dispatch_id?: number     # if re-routing, mark old dispatch superseded
        }
        """
        ensure_capability(
            request.user,
            'lab_process',
            'Only authorised laboratory staff can dispatch tests externally.',
        )
        order = self.get_object()
        _ensure_order_facility_access(request.user, order)
        order = LabOrder.objects.select_for_update().get(pk=order.pk)

        test_ids = request.data.get('test_ids') or []
        if not isinstance(test_ids, list) or not test_ids:
            return Response(
                {'error': 'test_ids must be a non-empty list'},
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
                partner = LabPartner.objects.get(id=partner_id, is_active=True)
                partner_name = partner.name
            except LabPartner.DoesNotExist:
                return Response(
                    {'error': 'Lab partner not found or inactive'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif partner_name_raw:
            partner_name = partner_name_raw
        else:
            return Response(
                {'error': 'Either partner_id or partner_name is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve the tests; refuse to dispatch tests from another order.
        tests = list(order.tests.select_for_update().filter(id__in=test_ids))
        missing = set(test_ids) - {t.id for t in tests}
        if missing:
            return Response(
                {'error': f'Some tests are not part of this order: {sorted(missing)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        active_overlap = order.dispatches.filter(status='issued', tests__in=tests).distinct()
        if active_overlap.exists() and not supersede_id:
            return Response(
                {'error': 'One or more selected tests already have an active dispatch.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Tests must be at or before "processing" — refuse to dispatch verified
        # / rejected / results-ready tests (those need a different workflow).
        non_dispatchable = [t for t in tests if t.status in ('rejected', 'verified', 'results_ready')]
        if non_dispatchable:
            return Response(
                {
                    'error': (
                        'These tests can no longer be dispatched: '
                        + ', '.join(f'{t.code} ({t.status})' for t in non_dispatchable)
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optionally mark a prior dispatch as superseded (when re-routing).
        prior = None
        if supersede_id:
            try:
                prior = order.dispatches.select_for_update().get(id=supersede_id, status='issued')
            except LabReferralDispatch.DoesNotExist:
                return Response(
                    {'error': 'Prior dispatch not found or not currently issued'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            selected_test_ids = {test.id for test in tests}
            prior_test_ids = set(prior.tests.values_list('id', flat=True))
            if not selected_test_ids.issubset(prior_test_ids):
                return Response(
                    {'error': 'Prior dispatch must cover all selected tests.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Create the new dispatch.
        partner_address_snapshot = ''
        if partner:
            partner_address_snapshot = (partner.address or '').strip()

        dispatch = LabReferralDispatch.objects.create(
            order=order,
            partner=partner,
            partner_name=partner_name,
            partner_address_snapshot=partner_address_snapshot,
            notes=notes or reason,
            issued_by=request.user,
        )
        dispatch.tests.set(tests)

        # Flip each test to processing/outsourced.
        for test in tests:
            LabTestRoutingEvent.objects.create(
                test=test,
                from_clinic=test.processing_clinic,
                to_clinic=None,
                destination_type='external',
                external_destination=partner_name,
                reason=reason,
                changed_by=request.user,
            )
            test.routing_status = 'referred_external'
            test.processing_method = 'outsourced'
            test.outsourced_lab = partner_name
            test.status = 'processing'
            test.processed_by = request.user
            test.processed_at = timezone.now()
            test.save(update_fields=[
                'routing_status', 'processing_method', 'outsourced_lab', 'status',
                'processed_by', 'processed_at', 'updated_at',
            ])

        if prior:
            prior.status = 'superseded'
            prior.superseded_by = dispatch
            prior.save(update_fields=['status', 'superseded_by'])

        AuditService.log_activity(
            user=request.user,
            action='create',
            object_type='lab_referral_dispatch',
            object_id=str(dispatch.id),
            module='laboratory',
            object_repr=dispatch.dispatch_id,
            description=(
                f'Dispatched {len(tests)} test(s) from {order.order_id} '
                f'to {partner_name}'
            ),
            new_values={
                'dispatch_id': dispatch.dispatch_id,
                'partner_name': partner_name,
                'test_codes': [t.code for t in tests],
            },
            metadata={'order_id': order.order_id, 'supersedes': prior.dispatch_id if prior else None},
            request=request,
        )

        return Response(
            LabReferralDispatchSerializer(dispatch).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(tags=["Laboratory"], summary="Dispatches/(?P<dispatch id>[^/.]+)/cancel", description="Cancel a still-issued dispatch (e.g. wrong partner, withdrew sample).", parameters=ORDER_DISPATCH_ID_PARAMS)
    @action(detail=True, methods=['post'], url_path='dispatches/(?P<dispatch_id>[^/.]+)/cancel')
    @transaction.atomic
    def cancel_dispatch(self, request, pk=None, dispatch_id=None):
        """
        Cancel a still-issued dispatch (e.g. wrong partner, withdrew sample).

        Each test on the dispatch is reverted to ``sample_collected`` and its
        outsourcing fields cleared (`processing_method`, `outsourced_lab`,
        `processed_by`, `processed_at`). That puts the tests back in the
        eligible pool so a fresh dispatch can be issued without a separate
        manual reset. Tests already past ``processing`` (results submitted /
        verified) are left alone — those need clinical review.
        """
        order = self.get_object()
        _ensure_order_facility_access(request.user, order)
        try:
            dispatch = order.dispatches.select_for_update().get(id=dispatch_id)
        except LabReferralDispatch.DoesNotExist:
            return Response({'error': 'Dispatch not found'}, status=status.HTTP_404_NOT_FOUND)

        if dispatch.status != 'issued':
            return Response(
                {'error': f'Dispatch is already {dispatch.status}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data.get('reason') or '').strip()

        reverted_test_codes: list[str] = []
        skipped_test_codes: list[str] = []
        for test in dispatch.tests.select_for_update().all():
            # Only revert tests that are still in the outsourced 'processing'
            # bucket. If results were already entered or verified, untangling
            # them requires the verification UI, not a cancel button.
            if test.status == 'processing':
                return_clinic = test.processing_clinic or order.processing_clinic or order.location_clinic
                LabTestRoutingEvent.objects.create(
                    test=test,
                    from_clinic=test.processing_clinic,
                    to_clinic=return_clinic,
                    destination_type='internal' if return_clinic else 'external',
                    external_destination='' if return_clinic else 'Cancelled external dispatch',
                    reason=reason,
                    changed_by=request.user,
                )
                test.routing_status = 'pending_triage'
                test.status = 'sample_collected'
                test.processing_method = ''
                test.outsourced_lab = ''
                test.processed_by = None
                test.processed_at = None
                test.save(update_fields=[
                    'status', 'processing_method', 'outsourced_lab',
                    'processed_by', 'processed_at', 'routing_status', 'updated_at',
                ])
                reverted_test_codes.append(test.code)
            else:
                skipped_test_codes.append(f'{test.code} ({test.status})')

        dispatch.status = 'cancelled'
        dispatch.cancellation_reason = reason
        dispatch.cancelled_at = timezone.now()
        dispatch.cancelled_by = request.user
        dispatch.save(update_fields=['status', 'cancellation_reason', 'cancelled_at', 'cancelled_by'])

        AuditService.log_activity(
            user=request.user,
            action='update',
            object_type='lab_referral_dispatch',
            object_id=str(dispatch.id),
            module='laboratory',
            object_repr=dispatch.dispatch_id,
            description=(
                f'Cancelled dispatch {dispatch.dispatch_id}'
                + (f' (reverted {len(reverted_test_codes)} test(s))' if reverted_test_codes else '')
            ),
            new_values={
                'status': 'cancelled',
                'cancellation_reason': reason,
                'reverted_tests': reverted_test_codes,
                'skipped_tests': skipped_test_codes,
            },
            metadata={'order_id': order.order_id},
            request=request,
        )

        return Response(LabReferralDispatchSerializer(dispatch).data)

    @extend_schema(tags=["Laboratory"], summary="Dispatches/(?P<dispatch id>[^/.]+)/referral letter", description="Download the referral letter PDF for a specific dispatch.", parameters=ORDER_DISPATCH_ID_PARAMS)
    @action(detail=True, methods=['get'], url_path='dispatches/(?P<dispatch_id>[^/.]+)/referral_letter')
    def dispatch_referral_letter(self, request, pk=None, dispatch_id=None):
        """Download the referral letter PDF for a specific dispatch."""
        order = self.get_object()
        try:
            dispatch = order.dispatches.get(id=dispatch_id)
        except LabReferralDispatch.DoesNotExist:
            return Response({'error': 'Dispatch not found'}, status=status.HTTP_404_NOT_FOUND)

        from .dispatch_pdfs import build_referral_letter_pdf

        pdf_bytes = build_referral_letter_pdf(dispatch)
        if not dispatch.referral_letter_printed_at:
            dispatch.referral_letter_printed_at = timezone.now()
            dispatch.save(update_fields=['referral_letter_printed_at'])

        filename = f"referral_{dispatch.dispatch_id}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @extend_schema(tags=["Laboratory"], summary="Dispatches/(?P<dispatch id>[^/.]+)/responsibility form", description="Download the financial-responsibility form PDF for a specific dispatch.", parameters=ORDER_DISPATCH_ID_PARAMS)
    @action(detail=True, methods=['get'], url_path='dispatches/(?P<dispatch_id>[^/.]+)/responsibility_form')
    def dispatch_responsibility_form(self, request, pk=None, dispatch_id=None):
        """Download the financial-responsibility form PDF for a specific dispatch."""
        order = self.get_object()
        try:
            dispatch = order.dispatches.get(id=dispatch_id)
        except LabReferralDispatch.DoesNotExist:
            return Response({'error': 'Dispatch not found'}, status=status.HTTP_404_NOT_FOUND)

        from .dispatch_pdfs import build_responsibility_form_pdf

        pdf_bytes = build_responsibility_form_pdf(dispatch)
        if not dispatch.responsibility_form_printed_at:
            dispatch.responsibility_form_printed_at = timezone.now()
            dispatch.save(update_fields=['responsibility_form_printed_at'])

        filename = f"responsibility_{dispatch.dispatch_id}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @extend_schema(tags=["Laboratory"], summary="Submit results", description="Submit results for a test.")
    @action(detail=True, methods=['post'])
    def submit_results(self, request, pk=None):
        """Submit results for a test."""
        ensure_capability(
            request.user,
            "lab_result_submit",
            "Only authorised laboratory staff can submit results.",
        )
        order = self.get_object()
        test_id = request.data.get('test_id')
        results = _parse_results_payload(request.data.get('results', {}))
        notes = request.data.get('notes', '')
        result_file = request.FILES.get('result_file')
        report_file_count = int(request.POST.get('report_file_count', 0)) if request.content_type and 'multipart/form-data' in request.content_type else 0
        
        try:
            test = order.tests.get(id=test_id)
            
            # Basic validation: results must be a dict when submitted as JSON.
            if results is None:
                results = {}
            if not isinstance(results, dict):
                results = {'Result': str(results)}
            custom_rows = results.get('custom_results') if isinstance(results, dict) else None

            # If the test has a template with defined parameters, enforce required keys.
            # This prevents multi-parameter tests (e.g. FBC) from being saved as a single generic "Result".
            template = getattr(test, 'template', None)
            normal_range = getattr(template, 'normal_range', None) if template else None
            template_code = str(getattr(template, 'code', '') or test.code or '').upper()
            is_other_test = template_code in OTHER_TEMPLATE_CODES
            has_custom_rows = isinstance(custom_rows, list)
            if isinstance(normal_range, dict) and normal_range and not (is_other_test and has_custom_rows):
                # Canonicalize single-analyte alias payloads:
                # map legacy {"Result": "..."} to the template parameter key and avoid storing duplicates.
                if len(normal_range) == 1 and isinstance(results, dict):
                    only_key = next(iter(normal_range.keys()))
                    result_alias = str(results.get("Result", "")).strip()
                    canonical_value = str(results.get(only_key, "")).strip()
                    if result_alias and not canonical_value:
                        results[only_key] = results.get("Result")
                    # Remove alias only when canonical key is different from "Result".
                    if (
                        only_key != "Result"
                        and "Result" in results
                        and str(results.get(only_key, "")).strip() == result_alias
                    ):
                        results.pop("Result", None)

                # Determine required keys if present; otherwise treat all template keys as required.
                required_keys = [
                    k for k, v in normal_range.items()
                    if isinstance(v, dict) and v.get('required') is True
                ]
                if not required_keys:
                    required_keys = list(normal_range.keys())

                # For multi-parameter templates, block the common bad shape: {"Result": "..."} only.
                if len(normal_range) > 1 and set(results.keys()) == {"Result"}:
                    return Response(
                        {
                            'error': (
                                f'Incomplete results for {test.code}. This test requires parameterized results '
                                f'({len(normal_range)} fields), not a single "Result" value.'
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )

                missing = [k for k in required_keys if not str(results.get(k, '')).strip()]
                if missing and not (result_file or report_file_count > 0):
                    return Response(
                        {'error': f'Missing required result field(s): {", ".join(missing)}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # Check if this was a rejected test being resubmitted
            was_rejected = test.status == 'rejected' or test.rejected_by is not None
            
            has_structured_results = _has_meaningful_results_payload(results)
            has_result_file = bool(result_file or report_file_count > 0)
            if not (has_structured_results or has_result_file):
                return Response(
                    {'error': 'No result values were provided. Enter at least one result or upload a result file.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            test.results = results
            test.notes = notes

            # Handle file uploads (multiple files via indexed keys)
            if report_file_count > 0:
                report_files = [request.FILES.get(f'report_file_{i}') for i in range(report_file_count)]
                report_files = [f for f in report_files if f]
                if report_files:
                    test.result_file = report_files[0]
                    for f in report_files[1:]:
                        LabTestResultAttachment.objects.create(
                            test=test,
                            row_id='',
                            row_name=f.name[:200],
                            file=f,
                            uploaded_by=request.user,
                        )
            elif result_file:
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

            if isinstance(custom_rows, list):
                row_names_by_id = {}
                for row in custom_rows:
                    if not isinstance(row, dict):
                        continue
                    row_id = str(row.get('id') or '').strip()
                    if row_id:
                        row_names_by_id[row_id] = str(row.get('name') or '').strip()
                for key, uploaded_file in request.FILES.items():
                    if not key.startswith('custom_attachment_') or not uploaded_file:
                        continue
                    row_id = key.replace('custom_attachment_', '', 1).strip()
                    if not row_id:
                        continue
                    LabTestResultAttachment.objects.update_or_create(
                        test=test,
                        row_id=row_id,
                        defaults={
                            'row_name': row_names_by_id.get(row_id, ''),
                            'file': uploaded_file,
                            'uploaded_by': request.user,
                        },
                    )
            
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


@document_viewset(tag="Laboratory", resource="lab tests")
class LabTestViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing lab tests."""
    serializer_class = LabTestSerializer
    facility_filter_field = 'order__location_clinic'
    facility_scope_fields = ('order__location_clinic', 'order__processing_clinic', 'processing_clinic')
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['order', 'status', 'processing_method', 'order__patient']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return LabTest.objects.none()
        
        queryset = LabTest.objects.all().select_related(
            'order',
            'order__location_clinic',
            'processing_clinic',
            'order__visit',
            'order__visit__location_clinic',
            'order__consultation_session',
            'order__consultation_session__location_clinic',
            'order__consultation_session__room__location_clinic',
            'template',
            'collected_by',
            'processed_by',
            'verified_by',
            'rejected_by',
            'result_record',
        )

        # Filter by status if provided
        status_filter = self.request.query_params.get('status', None)
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        results_only = (self.request.query_params.get('results_only') or '').lower()
        if results_only in ('1', 'true', 'yes'):
            queryset = queryset.filter(status__in=['results_ready', 'verified'])

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


@document_viewset(tag="Laboratory", resource="lab results", read_only=True)
class LabResultViewSet(FacilityScopedMixin, viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing lab results awaiting verification."""
    
    facility_filter_field = 'order__processing_clinic'
    serializer_class = LabResultSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'overall_status', 'priority']
    search_fields = [
        'order__order_id',
        'order__lab_number',
        'test__lab_number',
        'patient__patient_id',
        'patient__personal_number',
        'patient__surname',
        'patient__first_name',
        'patient__middle_name',
        'test__code',
        'test__name',
        'test__template__name',
    ]
    ordering_fields = ['created_at', 'test__verified_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        # Filter by status if provided, default to 'results_ready' for pending verifications
        if getattr(self, 'swagger_fake_view', False):
            return LabResult.objects.none()
        
        status_filter = self.request.query_params.get('status', 'results_ready')

        # Include test template to avoid N+1 queries when serializing template fields (normal_range/unit/etc).
        queryset = LabResult.objects.select_related(
            'test',
            'test__template',
            'test__order',
            'test__order__visit',
            'test__order__consultation_session__room__location_clinic',
            'order',
            'order__patient',
            'order__doctor',
            'patient',
        )

        if status_filter == 'results_ready':
            queryset = queryset.filter(test__status='results_ready')
        elif status_filter == 'verified':
            queryset = queryset.filter(test__status='verified')
        elif status_filter == 'all':
            queryset = queryset.filter(Q(test__status='results_ready') | Q(test__status='verified'))

        # Date filtering (match Manage Visits style query params).
        # Pending rows use processed_at (when result became ready), while verified
        # rows use verified_at.
        date = self.request.query_params.get('date')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        date_field = 'test__verified_at__date'
        if status_filter == 'results_ready':
            date_field = 'test__processed_at__date'
        if date:
            queryset = queryset.filter(**{date_field: date})
        elif start_date:
            queryset = queryset.filter(**{f'{date_field}__gte': start_date})
            if end_date:
                queryset = queryset.filter(**{f'{date_field}__lte': end_date})
        elif end_date:
            queryset = queryset.filter(**{f'{date_field}__lte': end_date})

        # Clinic filtering (stored on LabOrder.clinic as a string)
        clinic = self.request.query_params.get('clinic')
        if clinic:
            queryset = queryset.filter(order__clinic=clinic)

        location_clinic_id = _parse_location_clinic_id(self.request)
        if location_clinic_id is not None:
            queryset = queryset.filter(order__location_clinic_id=location_clinic_id)

        # Gender filtering (stored on Patient.gender)
        gender = self.request.query_params.get('gender')
        if gender:
            queryset = queryset.filter(order__patient__gender=gender)

        pm = self.request.query_params.get('processing_method')
        if pm in ('in_house', 'outsourced'):
            queryset = queryset.filter(test__processing_method=pm)

        # Keep this guard in SQL so pagination and search happen without first
        # scanning every historical result in Python.
        queryset = queryset.annotate(
            _has_meaningful_results=RawSQL(
                "jsonb_path_exists(results, %s)",
                ['$.* ? (@ != null && @ != "")'],
                output_field=BooleanField(),
            )
        ).filter(
            (Q(test__result_file__isnull=False) & ~Q(test__result_file=""))
            | Q(_has_meaningful_results=True)
        )

        return self.scope_queryset(queryset)

    @extend_schema(tags=["Laboratory"], summary="Stats", description="Stats for verification history/completed tests.")
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Stats for verification history/completed tests.
        Respects the same filters as list endpoint (status/date/clinic/gender/search/etc).
        """
        qs = self.filter_queryset(self.get_queryset())

        total = qs.count()
        by_status = qs.aggregate(
            normal=Count('id', filter=Q(overall_status='normal')),
            abnormal=Count('id', filter=Q(overall_status='abnormal')),
            critical=Count('id', filter=Q(overall_status='critical')),
        )

        return Response({
            'total': total,
            'normal': by_status.get('normal', 0) or 0,
            'abnormal': by_status.get('abnormal', 0) or 0,
            'critical': by_status.get('critical', 0) or 0,
        })
    
    @extend_schema(tags=["Laboratory"], summary="Download report", description="Download lab result as PDF report (uses standardized NPA PDF house style).")
    @action(detail=True, methods=['get'])
    def download_report(self, request, pk=None):
        """Download lab result as PDF report (uses standardized NPA PDF house style)."""
        # Do not rely on list filters (status/date/search) for detail download.
        # Frontend must pass LabResult.id (see CompletedTest.labResultId).
        base_qs = LabResult.objects.select_related(
            'test',
            'order',
            'patient',
            'patient__principal_staff',
            'order__doctor',
            'test__template',
            'test__processed_by',
            'test__verified_by',
        )
        base_qs = self.scope_queryset(base_qs)
        result = get_object_or_404(base_qs, pk=pk)

        from common.date_display import format_display_date, format_display_datetime
        from common.pdf import (
            NPADocument,
            patient_info_block,
            request_line,
            centered_section_title,
            data_table,
            signature_line,
            italic_paragraph,
            body_paragraph,
            section_heading,
        )
        from reportlab.lib.units import inch
        from reportlab.platypus import Spacer

        def _fmt_dt(value):
            if not value:
                return 'N/A'
            try:
                return format_display_datetime(value)
            except Exception:
                return 'N/A'

        def _normalize_key(s):
            return ' '.join(str(s or '').split()).strip().lower()

        def _fmt_reference_range(meta):
            if not meta:
                return ''
            rng = meta.get('range')
            if isinstance(rng, str) and rng.strip():
                return rng.strip()
            min_v = meta.get('min', meta.get('normalRangeMin'))
            max_v = meta.get('max', meta.get('normalRangeMax'))
            if min_v not in (None, '') and max_v not in (None, ''):
                return f"{min_v}-{max_v}"
            return ''

        def _classify(value, meta):
            """Mirrors classifyValue in template-utils.ts (parseFloat semantics)."""
            if value is None:
                return 'Normal'
            value_str = str(value).strip()
            if not value_str:
                return 'Normal'
            data_type = (meta or {}).get('dataType')
            if isinstance(data_type, str) and data_type.lower() == 'text':
                return 'Normal'
            m = re.match(r'\s*([+-]?\d+(\.\d+)?|\.\d+)', value_str)
            if not m:
                return 'Normal'
            try:
                num = float(m.group(1))
            except Exception:
                return 'Normal'

            def _num(x):
                try:
                    if x in (None, ''):
                        return None
                    return float(x)
                except Exception:
                    return None

            crit_min = _num((meta or {}).get('critical_min', (meta or {}).get('criticalMin')))
            crit_max = _num((meta or {}).get('critical_max', (meta or {}).get('criticalMax')))
            min_v = _num((meta or {}).get('min', (meta or {}).get('normalRangeMin')))
            max_v = _num((meta or {}).get('max', (meta or {}).get('normalRangeMax')))

            if (crit_min is not None and num < crit_min) or (crit_max is not None and num > crit_max):
                return 'Critical'
            if (min_v is not None and num < min_v) or (max_v is not None and num > max_v):
                return 'Abnormal'
            return 'Normal'

        def _flag_letter(value, meta):
            """Return clinical flag (H/L/HH/LL) using value vs. (critical) range."""
            if value is None or meta is None:
                return ''
            value_str = str(value).strip()
            if not value_str:
                return ''
            m = re.match(r'\s*([+-]?\d+(\.\d+)?|\.\d+)', value_str)
            if not m:
                return ''
            try:
                num = float(m.group(1))
            except Exception:
                return ''

            def _num(x):
                try:
                    if x in (None, ''):
                        return None
                    return float(x)
                except Exception:
                    return None

            crit_min = _num((meta or {}).get('critical_min', (meta or {}).get('criticalMin')))
            crit_max = _num((meta or {}).get('critical_max', (meta or {}).get('criticalMax')))
            min_v = _num((meta or {}).get('min', (meta or {}).get('normalRangeMin')))
            max_v = _num((meta or {}).get('max', (meta or {}).get('normalRangeMax')))

            if crit_max is not None and num > crit_max:
                return 'HH'
            if crit_min is not None and num < crit_min:
                return 'LL'
            if max_v is not None and num > max_v:
                return 'H'
            if min_v is not None and num < min_v:
                return 'L'
            return ''

        # Resolve template metadata so we can populate Unit / Reference Range
        # consistently with the frontend's lib/laboratory/template-utils.ts.
        template_normal_range = {}
        try:
            if result.test and result.test.template and isinstance(result.test.template.normal_range, dict):
                template_normal_range = result.test.template.normal_range
        except Exception:
            template_normal_range = {}

        analyte_meta_by_key = {
            _normalize_key(k): v
            for k, v in template_normal_range.items()
            if isinstance(k, str) and not k.startswith('_') and isinstance(v, dict)
        }

        def _meta_for(parameter_name):
            return analyte_meta_by_key.get(_normalize_key(parameter_name))

        # Build the result-rows + per-row status + flag-letter lists.
        result_rows = []
        row_statuses = []
        row_flags = []

        if result.test.results and isinstance(result.test.results, dict):
            results_dict = result.test.results
            custom_list = results_dict.get('custom_results')
            use_custom_only = isinstance(custom_list, list) and len(custom_list) > 0

            packed_rows = []

            if use_custom_only:
                for row in custom_list:
                    if not isinstance(row, dict):
                        continue
                    name = str(row.get('name') or 'Custom Result')
                    value = row.get('value', '')
                    if value is None:
                        value = ''
                    unit = str(row.get('unit') or '')
                    ref_range = str(row.get('reference_range') or '')
                    status = str(row.get('status') or 'normal').title()
                    if status not in ('Normal', 'Abnormal', 'Critical'):
                        status = 'Normal'
                    packed_rows.append(
                        (name, '' if value is None else str(value), unit, ref_range, status, '')
                    )
            else:
                for param, param_data in results_dict.items():
                    if param == 'custom_results':
                        continue
                    meta = _meta_for(param)
                    if isinstance(param_data, dict):
                        value = param_data.get('value', '')
                        unit = str(param_data.get('unit') or (meta or {}).get('unit') or '')
                        ref_range = str(
                            param_data.get('reference_range') or _fmt_reference_range(meta)
                        )
                        raw_status = str(param_data.get('status') or '').strip().title()
                        if raw_status in ('Normal', 'Abnormal', 'Critical'):
                            status = raw_status
                        else:
                            status = _classify(value, meta)
                    else:
                        value = param_data
                        unit = str((meta or {}).get('unit') or '')
                        ref_range = _fmt_reference_range(meta)
                        status = _classify(value, meta)
                    packed_rows.append(
                        (
                            str(param),
                            '' if value is None else str(value),
                            unit,
                            ref_range,
                            status,
                            _flag_letter(value, meta),
                        )
                    )

            packed_rows = dedupe_result_alias_rows(
                sort_lab_result_rows_for_pdf(packed_rows, template_normal_range)
            )

            for param, value, unit, ref_range, status, flag in packed_rows:
                result_rows.append(
                    [param, value, unit, ref_range, status]
                )
                row_statuses.append(status)
                row_flags.append(flag)

        if not result_rows:
            result_rows.append(['Result', 'N/A', '', '', ''])
            row_statuses.append('Normal')
            row_flags.append('')

        # Patient + order metadata
        patient_age = getattr(result.patient, 'age', None)
        age_str = f"{patient_age} YEARS" if patient_age else "—"
        gender = (result.patient.gender or '').upper() or "—"
        patient_id_display = getattr(result.patient, 'patient_id', '') or "—"

        doctor_name = (
            result.order.doctor.get_full_name()
            if result.order and result.order.doctor else '—'
        )
        clinic_name = (
            getattr(getattr(result, 'order', None), 'clinic', None) or '—'
        )

        # Timing — use short dates (DD.MM.YYYY) like the paper template.
        def _fmt_short(value):
            if not value:
                return '—'
            try:
                formatted = format_display_date(value)
                return formatted or '—'
            except Exception:
                return '—'

        ordered_at = None
        try:
            ordered_at = getattr(getattr(result, 'order', None), 'ordered_at', None)
        except Exception:
            ordered_at = None

        processed_at = getattr(result.test, 'processed_at', None)
        verified_at = getattr(result.test, 'verified_at', None)
        sample_collected_at = getattr(result.test, 'collected_at', None)

        # Specimen / sample type from template (defaults to 'BLOOD' for haematology)
        specimen = (
            getattr(result.test, 'sample_type', '') or
            getattr(getattr(result.test, 'template', None), 'sample_type', '') or
            '—'
        ).upper()

        # Dept. = patient's NPA division (shared helper falls back to the
        # principal staff member's division for dependents). Same logic the
        # dispatch referral / responsibility PDFs use, so all lab paperwork
        # agrees on what "Dept." means.
        from .dispatch_pdfs import _division_line, _personal_number_line
        patient_department = _division_line(result.patient)

        clinical_diagnosis = (
            getattr(getattr(result, 'order', None), 'clinical_notes', None) or
            getattr(getattr(result, 'order', None), 'clinical_summary', None) or
            'ROUTINE'
        )
        if isinstance(clinical_diagnosis, str):
            clinical_diagnosis = clinical_diagnosis.upper()

        lab_no = (
            getattr(result.test, 'lab_number', None) or
            (getattr(result.order, 'lab_number', None) if result.order else None) or
            (result.order.order_id if result.order else f'LR-{result.id}')
        )

        p_no = _personal_number_line(result.patient)

        # Section title under the patient block reflects the test category
        # (HAEMATOLOGY / CHEMISTRY / SEROLOGY / etc.). Default to a generic label.
        category_raw = (
            getattr(getattr(result.test, 'template', None), 'category', None) or
            getattr(result.test, 'category', None) or
            'LABORATORY'
        )
        category_titles = {
            'haematology': 'HAEMATOLOGY REPORT',
            'hematology':  'HAEMATOLOGY REPORT',
            'chemistry':   'CLINICAL CHEMISTRY REPORT',
            'serology':    'SEROLOGY REPORT',
            'microbiology':'MICROBIOLOGY REPORT',
            'urinalysis':  'URINALYSIS REPORT',
            'parasitology':'PARASITOLOGY REPORT',
            'immunology':  'IMMUNOLOGY REPORT',
        }
        section_title_text = category_titles.get(
            str(category_raw).strip().lower(), 'LABORATORY REPORT'
        )

        # Build the document
        buffer = BytesIO()
        doc = NPADocument(
            buffer,
            department="MEDICAL LABORATORY SCIENCE DEPARTMENT",
            document_title=section_title_text,
        )

        # Build the data-table rows. The third column (between Results and
        # Units) is reserved for an optional "% differential" used by FBC-style
        # reports to mirror the paper template's PARAMETER | RESULTS | (% diff)
        # | UNITS | REF | FLAGS layout. We don't yet store the differential
        # separately, so it's left blank — but the column is allocated so future
        # results can populate it without changing the layout.
        table_rows = []
        for raw_row in result_rows:
            param, value, unit, ref, _ = raw_row
            table_rows.append([param, value, '', unit, ref, ''])

        story = [
            patient_info_block(
                left=[
                    ("Name", result.patient.get_full_name()),
                    ("Age", age_str),
                    ("Specimen", specimen),
                    ("Dept.", patient_department),
                    ("Clinical Diagnosis", clinical_diagnosis),
                ],
                middle=[
                    ("Sex", gender),
                    ("Collection Date", _fmt_short(sample_collected_at or ordered_at)),
                    ("Report Date", _fmt_short(verified_at or processed_at)),
                ],
                right=[
                    ("Doctor", doctor_name),
                    ("Lab. No.", lab_no),
                    ("Clinic", clinic_name),
                    ("P/No.", p_no),
                ],
                width=doc.usable_width,
            ),
            request_line("Request(s)", f"{result.test.name} ({result.test.code})", width=doc.usable_width),
            Spacer(1, 8),
            centered_section_title(section_title_text),
            data_table(
                ['PARAMETER', 'RESULTS', '', 'UNITS', 'REF. VALUES', 'FLAGS'],
                table_rows,
                col_widths=[1.7 * inch, 0.9 * inch, 0.7 * inch, 0.9 * inch, 1.4 * inch, 0.6 * inch],
                row_statuses=row_statuses,
                row_flags=row_flags,
                italic_col=0,
                flag_col=5,
            ),
        ]

        if result.test.verification_notes:
            story += [
                Spacer(1, 8),
                section_heading("Verification Notes"),
                body_paragraph(result.test.verification_notes),
            ]

        story += [
            Spacer(1, 10),
            signature_line(
                "Med. Lab. Scientist  ·  "
                + (result.test.processed_by.get_full_name() if result.test.processed_by else "")
            ),
        ]

        if result.test.verified_by:
            story += [
                signature_line(
                    "Verified by  ·  " + result.test.verified_by.get_full_name()
                ),
            ]

        story += [
            Spacer(1, 8),
            italic_paragraph(
                "This report was generated electronically and is valid without signature."
            ),
        ]

        document_serial = (
            f"LR-{lab_no}" if lab_no and not str(lab_no).startswith('LR-') else str(lab_no)
        )
        doc.build(story, document_serial=document_serial)

        buffer.seek(0)
        filename = f"lab_result_{result.patient.patient_id}_{result.test.code}_{result.id}.pdf"

        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'

        return response

    @extend_schema(tags=["Laboratory"], summary="Verify", description="Verify a lab result.")
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """Verify a lab result."""
        ensure_capability(
            request.user,
            "lab_result_verify",
            "Only authorised laboratory staff can verify results.",
        )
        result = self.get_object()
        test = result.test

        # Guardrail: block verification when there is no structured result and no uploaded file.
        results_payload = test.results if isinstance(test.results, dict) else {}
        has_structured_results = _has_meaningful_results_payload(results_payload)
        has_result_file = bool(test.result_file and getattr(test.result_file, "name", ""))
        if not (has_structured_results or has_result_file):
            return Response(
                {
                    "error": (
                        "Cannot verify this result yet. No result values or result file were found. "
                        "Please submit results first."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        
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


@document_viewset(tag="Laboratory", resource="template field options")
class TemplateFieldOptionViewSet(viewsets.ModelViewSet):
    queryset = TemplateFieldOption.objects.all()
    serializer_class = TemplateFieldOptionSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['template', 'field_name']
    pagination_class = None
