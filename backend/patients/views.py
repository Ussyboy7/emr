"""
Views for the Patients app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.shortcuts import get_object_or_404
from django.db.models import OuterRef, Subquery, Exists, Q

from .models import Patient, Visit, VitalReading, MedicalHistory, MedicalCertificate
from .serializers import (
    PatientSerializer,
    PatientListSerializer,
    VisitSerializer,
    VitalReadingSerializer,
    MedicalHistorySerializer,
    MedicalCertificateSerializer,
)
from audit.services import AuditService
from .workflow import close_visit_workflow


class PatientPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 500


class MedicalCertificatePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 500


def annotate_visit_history_flags(queryset):
    """Annotate visits with each patient's earliest visit id for first-visit classification."""
    first_visit_subquery = Visit.objects.filter(
        patient=OuterRef('patient')
    ).order_by('date', 'time', 'created_at', 'id').values('id')[:1]
    return queryset.annotate(first_visit_id=Subquery(first_visit_subquery))


def _exclude_visits_with_completed_consultation(queryset):
    """Visits that already have a completed consultation session (nursing pool should hide these)."""
    from consultation.models import ConsultationSession

    return queryset.filter(
        ~Exists(
            ConsultationSession.objects.filter(
                visit_id=OuterRef('pk'),
                status='completed',
            )
        )
    )


def _latest_vital_subqueries():
    """Subqueries for the most recent vital row per visit (by recorded_at)."""
    latest = VitalReading.objects.filter(visit_id=OuterRef('pk')).order_by('-recorded_at')
    return (
        Subquery(latest.values('temperature')[:1]),
        Subquery(latest.values('heart_rate')[:1]),
    )


def apply_nursing_status_filter(queryset, nursing_status: str, request):
    """
    Narrow visits for nursing pool queue (expects queryset already limited, e.g. in_progress + date).
    nursing_status: pending | vitals_incomplete | ready | sent_to_room
    """
    from consultation.models import ConsultationQueue

    ns = (nursing_status or '').strip().lower()
    if not ns or ns == 'all':
        return queryset

    if ns == 'pending':
        return queryset.filter(~Exists(VitalReading.objects.filter(visit_id=OuterRef('pk'))))

    lv_temp, lv_hr = _latest_vital_subqueries()
    qs = queryset.annotate(_lv_temp=lv_temp, _lv_hr=lv_hr).annotate(
        _has_vitals=Exists(VitalReading.objects.filter(visit_id=OuterRef('pk')))
    )

    if ns == 'vitals_incomplete':
        return qs.filter(_has_vitals=True).filter(
            Q(_lv_temp__isnull=True) | Q(_lv_hr__isnull=True)
        )

    if ns == 'ready':
        return qs.filter(_has_vitals=True).filter(
            _lv_temp__isnull=False,
            _lv_hr__isnull=False,
        )

    if ns == 'sent_to_room':
        q_items = ConsultationQueue.objects.filter(is_active=True, visit_id__isnull=False)
        date = request.query_params.get('date')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        if date:
            q_items = q_items.filter(queued_at__date=date)
        elif start_date:
            q_items = q_items.filter(queued_at__date__gte=start_date)
            if end_date:
                q_items = q_items.filter(queued_at__date__lte=end_date)
        elif end_date:
            q_items = q_items.filter(queued_at__date__lte=end_date)
        visit_ids = q_items.values('visit_id')
        return queryset.filter(id__in=visit_ids)

    return queryset


def _nursing_pool_base_queryset_for_metrics(view, request):
    """Shared base queryset: in_progress visits, optional nursing_pool exclusion, date + search + type + clinic."""
    qs = Visit.objects.all().select_related('patient', 'doctor', 'created_by').prefetch_related('vital_readings')
    date = request.query_params.get('date')
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    if date:
        qs = qs.filter(date=date)
    elif start_date:
        qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)
    elif end_date:
        qs = qs.filter(date__lte=end_date)

    qs = qs.filter(status='in_progress')
    if request.query_params.get('nursing_pool') == '1':
        qs = _exclude_visits_with_completed_consultation(qs)
    qs = annotate_visit_history_flags(qs)
    qs = view.filter_queryset(qs)
    return qs


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
    parser_classes = [MultiPartParser, FormParser, JSONParser]  # Support file uploads
    pagination_class = PatientPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'gender', 'blood_group', 'is_active', 'location', 'principal_staff']
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
        """Set created_by when creating a patient and log audit."""
        patient = serializer.save(created_by=self.request.user)
        AuditService.log_patient_action(
            user=self.request.user,
            action='create',
            patient=patient,
            module='medical_records',
            description=f'Registered new patient: {patient.get_full_name()} ({patient.patient_id})',
            new_values={'patient_id': patient.patient_id, 'name': patient.get_full_name(), 'category': patient.category},
            request=self.request,
        )
    
    def perform_update(self, serializer):
        """Update patient and log audit."""
        old_instance = self.get_object()
        old_values = {
            'surname': old_instance.surname,
            'first_name': old_instance.first_name,
            'category': old_instance.category,
            'patient_id': old_instance.patient_id,
            'is_active': old_instance.is_active,
        }

        # Check if category is changing and regenerate patient ID if needed
        category_changed = 'category' in serializer.validated_data and serializer.validated_data['category'] != old_instance.category

        patient = serializer.save()

        # Regenerate patient ID if category changed
        if category_changed:
            id_changed = patient.regenerate_patient_id()
            if id_changed:
                patient.save()  # Save the new patient ID

        new_values = {
            'surname': patient.surname,
            'first_name': patient.first_name,
            'category': patient.category,
            'patient_id': patient.patient_id,
            'is_active': patient.is_active,
        }
        AuditService.log_patient_action(
            user=self.request.user,
            action='update',
            patient=patient,
            module='medical_records',
            description=f'Updated patient: {patient.get_full_name()} ({patient.patient_id})',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )
    
    def perform_destroy(self, instance):
        """Soft delete patient and log audit."""
        patient_id = instance.id
        patient_repr = instance.get_full_name()
        instance.is_active = False
        instance.save()
        AuditService.log_patient_action(
            user=self.request.user,
            action='delete',
            patient=instance,
            module='medical_records',
            description=f'Deactivated patient: {patient_repr} ({instance.patient_id})',
            old_values={'is_active': True},
            new_values={'is_active': False},
            request=self.request,
        )

    def destroy(self, request, *args, **kwargs):
        """
        Restrict patient deletion to super admin/admin users.
        """
        user = request.user
        role = (getattr(user, 'system_role', '') or '').strip().lower()
        is_admin_user = user.is_superuser or role in {'system administrator', 'admin staff'}
        if not is_admin_user:
            raise PermissionDenied('Only super admin or admin users can delete patients.')
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=False, methods=['get'], url_path='counts')
    def counts(self, request):
        """Return total and per-category patient counts (active only, not filtered by search/filters)."""
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'employees': qs.filter(category='employee').count(),
            'retirees': qs.filter(category='retiree').count(),
            'dependents': qs.filter(category='dependent').count(),
            'nonnpa': qs.filter(category='nonnpa').count(),
        })

    @action(detail=True, methods=['get'])
    def visits(self, request, pk=None):
        """Get all visits for a patient."""
        patient = self.get_object()
        visits = annotate_visit_history_flags(patient.visits.all()).order_by('-date', '-time')
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
    search_fields = ['visit_id', 'clinical_notes', 'patient__surname', 'patient__first_name', 'patient__patient_id']
    ordering_fields = ['date', 'time', 'created_at']
    ordering = ['-date', '-time']
    
    def get_queryset(self):
        queryset = Visit.objects.all().select_related('patient', 'doctor', 'created_by').prefetch_related('vital_readings')
        
        # Date filtering
        date = self.request.query_params.get('date')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if date:
            queryset = queryset.filter(date=date)
        elif start_date:
            queryset = queryset.filter(date__gte=start_date)
            if end_date:
                queryset = queryset.filter(date__lte=end_date)
        elif end_date:
            queryset = queryset.filter(date__lte=end_date)

        if self.request.query_params.get('nursing_pool') == '1':
            queryset = _exclude_visits_with_completed_consultation(queryset)

        queryset = annotate_visit_history_flags(queryset)

        nursing_status = self.request.query_params.get('nursing_status')
        if nursing_status:
            queryset = apply_nursing_status_filter(queryset, nursing_status, self.request)

        return queryset

    @action(detail=False, methods=['get'], url_path='nursing-pool-metrics')
    def nursing_pool_metrics(self, request):
        """
        Aggregate counts for nursing pool dashboard cards (same filters as list: date, search, clinic, type, nursing_pool).
        """
        base = _nursing_pool_base_queryset_for_metrics(self, request)
        return Response(
            {
                'total': base.count(),
                'pending_vitals': apply_nursing_status_filter(base, 'pending', request).count(),
                'ready_for_consultation': apply_nursing_status_filter(base, 'ready', request).count(),
                'sent_to_room': apply_nursing_status_filter(base, 'sent_to_room', request).count(),
            }
        )

    def perform_update(self, serializer):
        """
        Update visit and emit workflow notifications when status changes.

        - Medical Records -> Nursing Pool: when a visit is moved to `in_progress`,
          notify all Nursing Officers to take vitals.
        """
        old_instance = self.get_object()
        old_status = old_instance.status

        visit = serializer.save()

        try:
            new_status = visit.status
            if old_status != new_status and new_status == 'in_progress':
                from notifications.services import NotificationService

                patient_name = visit.patient.get_full_name()
                title = "Patient sent to Nursing"
                message = f"{patient_name} ({visit.visit_id}) has been sent to Nursing for vitals."

                NotificationService.notify_role(
                    role_name='Nursing Officer',
                    title=title,
                    message=message,
                    notification_type='workflow',
                    priority='normal',
                    action_url='/nursing/pool-queue',
                    object_type='visit',
                    object_id=str(visit.id),
                )
        except Exception:
            # Notifications must never break core workflow actions
            pass
    
    def perform_create(self, serializer):
        """Set created_by when creating a visit and log audit."""
        visit = serializer.save(created_by=self.request.user)
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='visit',
            object_id=str(visit.id),
            module='medical_records',
            object_repr=f'Visit {visit.visit_id}',
            description=f'Created visit {visit.visit_id} for patient {visit.patient.get_full_name()}',
            new_values={'visit_id': visit.visit_id, 'visit_type': visit.visit_type, 'status': visit.status},
            request=self.request,
        )

    @action(detail=True, methods=['post'], url_path='close-workflow')
    def close_workflow(self, request, pk=None):
        visit = self.get_object()
        reason = str(request.data.get('reason') or '').strip()
        source_stage = str(request.data.get('source_stage') or 'unknown').strip() or 'unknown'

        if visit.status == 'completed':
            return Response(
                {'detail': 'Completed visits cannot be cancelled from workflow close.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = close_visit_workflow(
            visit=visit,
            actor=request.user,
            reason=reason,
            source_stage=source_stage,
        )
        AuditService.log_activity(
            user=request.user,
            action='update',
            object_type='visit',
            object_id=str(visit.id),
            module='workflow',
            object_repr=f'Visit {visit.visit_id}',
            description=f'Closed visit workflow from {source_stage}',
            old_values={'status': 'in_progress'},
            new_values={'status': 'cancelled', **result},
            request=request,
        )
        return Response({'detail': 'Visit workflow closed.', **result})


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

    @action(detail=False, methods=['get'], url_path='latest-by-visits')
    def latest_by_visits(self, request):
        """
        Return latest vital reading per visit for a CSV list of visit IDs.
        Query param:
          - visit_ids: "1,2,3"
        Response:
          {
            "results": {
              "1": { ...vital... },
              "2": { ...vital... }
            }
          }
        """
        visit_ids_raw = request.query_params.get('visit_ids', '').strip()
        if not visit_ids_raw:
            return Response({'results': {}})

        visit_ids: list[int] = []
        for value in visit_ids_raw.split(','):
            value = value.strip()
            if not value:
                continue
            try:
                visit_id = int(value)
                if visit_id > 0:
                    visit_ids.append(visit_id)
            except (TypeError, ValueError):
                continue

        if not visit_ids:
            return Response({'results': {}})

        qs = (
            VitalReading.objects
            .filter(visit_id__in=visit_ids)
            .select_related('patient', 'visit', 'recorded_by')
            .order_by('visit_id', '-recorded_at')
        )

        latest_by_visit: dict[int, VitalReading] = {}
        for vital in qs:
            if vital.visit_id not in latest_by_visit:
                latest_by_visit[vital.visit_id] = vital

        serialized = VitalReadingSerializer(latest_by_visit.values(), many=True).data
        by_visit_id: dict[str, dict] = {}
        for item in serialized:
            visit_raw = item.get('visit')
            if visit_raw is None:
                continue
            try:
                visit_key = str(int(visit_raw))
            except (TypeError, ValueError):
                continue
            by_visit_id[visit_key] = item

        return Response({'results': by_visit_id})
    
    def perform_create(self, serializer):
        """Set recorded_by when creating a vital reading."""
        serializer.save(recorded_by=self.request.user)


class MedicalCertificateViewSet(viewsets.ModelViewSet):
    """
    Persisted medical certificates.
    Created by frontend "Medical Certificate" generator and printed later via browser print.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MedicalCertificateSerializer
    pagination_class = MedicalCertificatePagination
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    ordering_fields = ["issued_at", "valid_from", "valid_to", "certificate_number"]
    ordering = ["-issued_at"]

    def get_queryset(self):
        queryset = MedicalCertificate.objects.all().select_related("patient", "issued_by")
        patient_id = self.request.query_params.get("patient")
        if patient_id:
            queryset = queryset.filter(patient__id=patient_id)
        return queryset.order_by(*self.ordering)

    def perform_create(self, serializer):
        # Stamp who issued the certificate (doctor) - DB snapshot fields are handled in the model.
        serializer.save(issued_by=self.request.user)
