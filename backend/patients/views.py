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
from drf_spectacular.utils import extend_schema, extend_schema_view
from common.openapi import document_viewset
from django.shortcuts import get_object_or_404
from django.db.models import OuterRef, Subquery, Exists, Q, Count, Max
from django.db import transaction
from django.utils import timezone
from datetime import date, timedelta

from common.mixins import FacilityScopedMixin
from accounts.utils import resolve_facility, resolve_facility_id
from organization.models import SystemConfig
from django.http import HttpResponse
from django.core.files.base import ContentFile

from .photo import patient_photo_url
from .models import (
    Patient,
    Visit,
    VitalReading,
    MedicalHistory,
    MedicalCertificate,
    AnnualCheckup,
    AnnualCheckupProgrammeSettings,
    PatientRecordsNote,
    PatientClinicalDocument,
)
from .serializers import (
    PatientSerializer,
    PatientListSerializer,
    VisitSerializer,
    VitalReadingSerializer,
    MedicalHistorySerializer,
    MedicalCertificateSerializer,
    AnnualCheckupSerializer,
    AnnualCheckupSignOffSerializer,
    AnnualCheckupCreateSerializer,
    AnnualCheckupProgrammeSerializer,
    AnnualCheckupOrderInvestigationsSerializer,
    PatientRecordsNoteSerializer,
    PatientClinicalDocumentSerializer,
)
from .annual_checkup_services import (
    create_annual_checkup_for_visit,
    order_investigations_for_checkup,
    refresh_components_completed,
    sign_off_annual_checkup,
    validate_selected_component_codes,
)
from .annual_checkup_catalog import (
    create_catalog_components,
    get_active_catalog,
    get_default_selected_codes,
    get_full_catalog,
    serialize_catalog_entry,
    update_catalog_components,
)
from .annual_checkup_pdfs import build_annual_checkup_report_pdf
from audit.services import AuditService
from .permissions import (
    can_manage_patient_lifecycle,
    is_system_admin_user,
    can_delete_patient,
    can_edit_personal_number,
    can_merge_patient,
    can_unmerge_patient,
    requires_lifecycle_category_change,
)
from .workflow import close_visit_workflow, finalize_consultation_artifacts_for_visit


def _boolish(value) -> bool:
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'on')


def _snapshot_actor_name(user) -> str:
    try:
        return user.get_full_name() or getattr(user, 'username', '') or ''
    except Exception:
        return str(user)


def _mirror_clinical_document_into_result_tabs(*, patient, doc, referral, actor) -> dict:
    """
    Create lightweight external lab / radiology records so uploaded return
    documents also appear in the clinical Lab Results / Imaging tabs.
    """
    outcome = {
        'lab_order_id': None,
        'lab_test_id': None,
        'lab_result_id': None,
        'radiology_order_id': None,
        'radiology_study_id': None,
        'radiology_report_id': None,
    }

    visit = getattr(referral, 'visit', None)
    session = getattr(referral, 'session', None)
    facility_name = (doc.facility or getattr(referral, 'facility', '') or '').strip()
    clinician_name = (
        doc.clinician_name
        or getattr(referral, 'referred_by_name', '')
        or getattr(getattr(referral, 'referred_by', None), 'get_full_name', lambda: '')()
        or ''
    ).strip()
    title = (doc.title or doc.original_filename or '').strip()

    if doc.doc_type == 'lab':
        from laboratory.models import LabOrder, LabTest, LabResult

        order = LabOrder.objects.create(
            patient=patient,
            doctor=getattr(referral, 'referred_by', None),
            visit=visit,
            consultation_session=session,
            source_type='external_manual',
            external_requesting_doctor_name=clinician_name[:200],
            manual_request_reference=getattr(referral, 'referral_id', '')[:100],
            priority='routine',
            clinic=(getattr(visit, 'clinic', '') or getattr(referral, 'specialty', '') or 'External Laboratory')[:100],
            clinical_notes=(doc.notes or getattr(referral, 'reason', '') or '')[:1000],
            created_by=actor,
            location_clinic=getattr(patient, 'location_clinic', None),
            processing_clinic=getattr(patient, 'location_clinic', None),
        )
        test = LabTest.objects.create(
            order=order,
            name=title[:200] or 'External lab result',
            code='EXT-LAB',
            sample_type='External',
            status='verified',
            processing_method='outsourced',
            outsourced_lab=facility_name[:200],
            result_file=doc.file.name,
            notes=(doc.notes or '')[:1000],
            processed_by=actor,
            processed_at=timezone.now(),
            verified_by=actor,
            verified_at=timezone.now(),
        )
        result = LabResult.objects.create(
            test=test,
            order=order,
            patient=patient,
            overall_status='normal',
            priority='medium',
        )
        outcome.update(
            {
                'lab_order_id': order.id,
                'lab_test_id': test.id,
                'lab_result_id': result.id,
            }
        )
        return outcome

    if doc.doc_type == 'radiology':
        from radiology.models import RadiologyOrder, RadiologyStudy, RadiologyReport

        order = RadiologyOrder.objects.create(
            patient=patient,
            doctor=getattr(referral, 'referred_by', None),
            visit=visit,
            consultation_session=session,
            source_type='external_manual',
            external_requesting_doctor_name=clinician_name[:200],
            manual_request_reference=getattr(referral, 'referral_id', '')[:100],
            priority='routine',
            clinic=(getattr(visit, 'clinic', '') or getattr(referral, 'specialty', '') or 'External Radiology')[:100],
            clinical_notes=(doc.notes or getattr(referral, 'reason', '') or '')[:1000],
            provisional_diagnosis=(getattr(referral, 'clinical_summary', '') or '')[:1000],
            created_by=actor,
            location_clinic=getattr(patient, 'location_clinic', None),
            processing_clinic=getattr(patient, 'location_clinic', None),
            status='verified',
        )
        study = RadiologyStudy.objects.create(
            order=order,
            procedure=title[:200] or 'External imaging report',
            modality='External',
            status='verified',
            processing_method='outsourced',
            outsourced_facility=facility_name[:200],
            report=doc.notes or f'External imaging report from {facility_name or "partner facility"}',
            report_file=doc.file.name,
            reported_by=actor,
            reported_at=timezone.now(),
            verified_by=actor,
            verified_at=timezone.now(),
        )
        report = RadiologyReport.objects.create(
            study=study,
            order=order,
            patient=patient,
            overall_status='normal',
            priority='medium',
        )
        outcome.update(
            {
                'radiology_order_id': order.id,
                'radiology_study_id': study.id,
                'radiology_report_id': report.id,
            }
        )
    return outcome


class PatientPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 100


class MedicalCertificatePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 100


def annotate_visit_history_flags(queryset):
    """Annotate visits with each patient's earliest visit id for first-visit classification."""
    first_visit_subquery = Visit.objects.filter(
        patient=OuterRef('patient')
    ).order_by('date', 'time', 'created_at', 'id').values('id')[:1]
    return queryset.annotate(first_visit_id=Subquery(first_visit_subquery))


def _exclude_visits_with_completed_consultation(queryset):
    """Visits that already have a completed consultation session (active-only pool snapshot)."""
    from consultation.models import ConsultationSession

    return queryset.filter(
        ~Exists(
            ConsultationSession.objects.filter(
                visit_id=OuterRef('pk'),
                status='completed',
            )
        )
    )


def _nursing_pool_has_date_scope(request) -> bool:
    return bool(
        request.query_params.get('date')
        or request.query_params.get('start_date')
        or request.query_params.get('end_date')
    )


def apply_nursing_pool_visit_status_scope(queryset, request):
    """
    nursing_pool=1 visit.status scope.

    Date-scoped (Today / range): show the day's nursing activity — forwarded
    (in_progress) and completed visits. Completed consultation sessions stay
    visible so nurses can review who was treated; frontend stages them as
    Completed / Sent to Room / etc., never Ready again.

    No date (live snapshot): only open nursing work — in_progress visits that
    do not yet have a completed consultation session.
    """
    queryset = queryset.exclude(status='cancelled')
    if _nursing_pool_has_date_scope(request):
        return queryset.filter(status__in=['in_progress', 'completed'])
    return _exclude_visits_with_completed_consultation(
        queryset.filter(status='in_progress')
    )


def _latest_vital_subqueries():
    """Subqueries for the most recent vital row per visit (by recorded_at)."""
    latest = VitalReading.objects.filter(visit_id=OuterRef('pk')).order_by('-recorded_at')
    return (
        Subquery(latest.values('temperature')[:1]),
        Subquery(latest.values('heart_rate')[:1]),
    )


def apply_nursing_status_filter(
    queryset,
    nursing_status: str,
    request,
    *,
    sent_to_room_basis='queued_at',
):
    """
    Narrow visits for nursing pool queue (expects queryset already limited, e.g. in_progress + date).
    nursing_status: pending | vitals_incomplete | ready | sent_to_room | in_consultation | sent_to_physiotherapy | completed

    Stages are mutually exclusive (the three nursing cards on the dashboard
    should sum to Today's Visits, modulo 'Completed'):
      - pending:           no vitals AND not in queue/session
      - vitals_incomplete: partial vitals AND not in queue/session
      - ready:             complete vitals AND not in queue/session
      - sent_to_room:      in active queue (waiting for doctor)
      - in_consultation:   in active queue OR active/paused session
      - completed:         visit status completed OR session completed

    sent_to_room_basis (only sent_to_room):
    - queued_at: restrict queue rows by queued_at date (legacy; matches historical dashboard cards).
    - visit_date: any active queue row for visits already in queryset (visit date defines the period).
    """
    from consultation.models import ConsultationQueue, ConsultationSession

    ns = (nursing_status or '').strip().lower()
    if not ns or ns == 'all':
        return queryset

    # Nursing-stage filter: visits still in the nursing workflow, i.e. not
    # yet routed to a doctor / physio / eye clinic AND not yet closed out.
    # Excludes visits that are in an active queue, have a non-cancelled
    # session, or have status='completed'.
    still_in_nursing = (
        ~Exists(ConsultationQueue.objects.filter(is_active=True, visit_id=OuterRef('pk')))
        & ~Exists(
            ConsultationSession.objects.filter(visit_id=OuterRef('pk')).exclude(
                status='cancelled'
            )
        )
        & ~Q(status='completed')
    )

    if ns == 'pending':
        return queryset.filter(
            ~Exists(VitalReading.objects.filter(visit_id=OuterRef('pk'))),
            still_in_nursing,
        )

    if ns == 'completed':
        # Visit is fully closed out — either the visit status is completed, or a
        # consultation session on the visit is completed (covers the case where
        # the visit status hasn't transitioned yet).
        return queryset.filter(
            Q(status='completed')
            | Exists(
                ConsultationSession.objects.filter(
                    visit_id=OuterRef('pk'),
                    status='completed',
                )
            )
        )

    lv_temp, lv_hr = _latest_vital_subqueries()
    qs = queryset.annotate(_lv_temp=lv_temp, _lv_hr=lv_hr).annotate(
        _has_vitals=Exists(VitalReading.objects.filter(visit_id=OuterRef('pk')))
    )

    if ns == 'vitals_incomplete':
        # Has at least one vital reading AND at least one of temp/HR is null.
        # The `_has_vitals` filter is required: a visit with zero vitals
        # has both _lv_temp and _lv_hr NULL, which would otherwise match
        # (and double-count with the 'pending' bucket).
        return qs.filter(still_in_nursing, _has_vitals=True).filter(
            Q(_lv_temp__isnull=True) | Q(_lv_hr__isnull=True)
        )

    if ns == 'ready':
        return qs.filter(still_in_nursing).filter(
            _lv_temp__isnull=False,
            _lv_hr__isnull=False,
        )

    if ns == 'sent_to_room':
        # Exclude status='completed' so this bucket is mutually exclusive
        # with the 'completed' bucket (a visit that lingered in the queue
        # after being completed belongs in 'completed', not here).
        q_items = ConsultationQueue.objects.filter(
            is_active=True, visit_id__isnull=False
        )
        basis = (sent_to_room_basis or 'queued_at').strip().lower()
        if basis == 'visit_date':
            visit_ids = q_items.values('visit_id')
            return queryset.filter(id__in=visit_ids)
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
        return queryset.filter(id__in=visit_ids).exclude(status='completed')

    if ns == 'in_consultation':
        in_queue = Exists(
            ConsultationQueue.objects.filter(is_active=True, visit_id=OuterRef('pk'))
        )
        in_open_session = Exists(
            ConsultationSession.objects.filter(
                visit_id=OuterRef('pk'),
                status__in=['active', 'paused'],
            )
        )
        return queryset.exclude(status='completed').filter(in_queue | in_open_session)

    if ns in ('sent_to_physiotherapy', 'sent_to_physio'):
        from physiotherapy.models import PhysioOrder

        has_physio_order = Exists(
            PhysioOrder.objects.filter(
                visit_id=OuterRef('pk'),
                status__in=['pending', 'scheduled', 'in_progress', 'completed'],
            )
        )
        has_physio_clinic = Q(clinic='Physiotherapy') | Q(clinics__contains=['Physiotherapy'])
        not_in_room_queue = ~Exists(
            ConsultationQueue.objects.filter(is_active=True, visit_id=OuterRef('pk'))
        )
        return queryset.filter(
            not_in_room_queue,
            has_physio_order,
            has_physio_clinic,
        ).exclude(status='completed')

    return queryset


def _nursing_pool_base_queryset_for_metrics(view, request):
    """Shared base queryset for nursing pool metrics/analytics (matches list nursing_pool scope)."""
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

    nursing_pool = request.query_params.get('nursing_pool') == '1'
    nursing_status = (request.query_params.get('nursing_status') or '').strip()
    has_date = _nursing_pool_has_date_scope(request)

    if nursing_pool:
        qs = apply_nursing_pool_visit_status_scope(qs, request)
    elif nursing_status:
        if nursing_status.lower() == 'completed':
            qs = qs.filter(status__in=['in_progress', 'completed'])
        else:
            qs = qs.filter(status='in_progress')
    elif has_date:
        qs = qs.exclude(status='cancelled')
    else:
        qs = qs.filter(status='in_progress')

    qs = annotate_visit_history_flags(qs)
    qs = view.filter_queryset(qs)
    return qs


def _date_years_ago(years: int) -> date:
    """Approximate calendar date N years before today (for age filtering)."""
    today = date.today()
    try:
        return today.replace(year=today.year - years)
    except ValueError:
        return today.replace(year=today.year - years, month=2, day=28)


def _apply_patient_list_filters(queryset, request):
    """Optional list filters: age_min, age_max, last_visit_after, last_visit_before."""
    age_min = request.query_params.get("age_min")
    if age_min:
        try:
            queryset = queryset.filter(date_of_birth__lte=_date_years_ago(int(age_min)))
        except (TypeError, ValueError):
            pass
    age_max = request.query_params.get("age_max")
    if age_max:
        try:
            queryset = queryset.filter(date_of_birth__gt=_date_years_ago(int(age_max) + 1))
        except (TypeError, ValueError):
            pass
    last_visit_after = request.query_params.get("last_visit_after")
    if last_visit_after:
        queryset = queryset.filter(_last_visit_date__gte=last_visit_after)
    last_visit_before = request.query_params.get("last_visit_before")
    if last_visit_before:
        queryset = queryset.filter(_last_visit_date__lte=last_visit_before)
    return queryset


@extend_schema_view(
    list=extend_schema(summary="List patients", tags=["Patients"]),
    retrieve=extend_schema(summary="Retrieve patient", tags=["Patients"]),
    create=extend_schema(summary="Register patient", tags=["Patients"]),
    update=extend_schema(summary="Update patient", tags=["Patients"]),
    partial_update=extend_schema(summary="Partially update patient", tags=["Patients"]),
    destroy=extend_schema(summary="Deactivate patient", tags=["Patients"]),
)
class PatientViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing patients.
    
    list: Get a list of all patients (lightweight serializer)
    retrieve: Get detailed patient information
    create: Register a new patient
    update: Update patient information
    partial_update: Partially update patient information
    destroy: Soft delete a patient (set is_active=False)
    """
    
    facility_filter_field = 'location_clinic'
    parser_classes = [MultiPartParser, FormParser, JSONParser]  # Support file uploads
    pagination_class = PatientPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'gender', 'blood_group', 'is_active', 'location', 'principal_staff', 'location_clinic', 'patient_id']
    # List search: names, patient ID, personal number (not phone/email — fewer false positives).
    search_fields = ['patient_id', 'surname', 'first_name', 'middle_name', 'personal_number']
    ordering_fields = ['created_at', 'surname', 'first_name']
    ordering = ['-created_at']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Patient.objects.none()
        
        """Return queryset filtered by active patients by default.

        Tombstones (records folded into another patient via merge) are
        excluded by default. Admins can opt in with `?include_merged=1`
        (e.g. for cleanup / audit) and see only tombstones with
        `?only_merged=1`. The `?include_inactive=true` flag continues to
        surface any other inactive (non-merged) records.
        """
        queryset = Patient.objects.all()
        # Filter by active status if not explicitly requested
        if self.request.query_params.get('include_inactive') != 'true':
            queryset = queryset.filter(is_active=True)
        # Filter out merge tombstones unless explicitly requested
        include_merged = self.request.query_params.get('include_merged') == '1'
        only_merged = self.request.query_params.get('only_merged') == '1'
        if only_merged:
            queryset = queryset.filter(merged_into__isnull=False)
        elif not include_merged:
            queryset = queryset.filter(merged_into__isnull=True)
        # Patients are a universal/shared registry: any patient may receive care at
        # any clinic, so the master list, counts, and retrieve are intentionally NOT
        # clinic-scoped. Clinic attribution (home clinic) is informational only; see
        # scope_queryset usage on visit/vitals sub-actions for per-clinic gating.
        queryset = queryset.select_related('principal_staff', 'created_by', 'updated_by')
        if self.action == 'list':
            latest_visit = Visit.objects.filter(patient=OuterRef('pk')).order_by(
                '-date', '-time', '-created_at'
            )
            queryset = queryset.annotate(
                _total_visits=Count('visits'),
                _last_visit_date=Subquery(latest_visit.values('date')[:1]),
                _last_visit_time=Subquery(latest_visit.values('time')[:1]),
            )
            queryset = _apply_patient_list_filters(queryset, self.request)
        return queryset

    def filter_queryset(self, queryset):
        # Patients are a universal registry, so reads (list/counts/retrieve) must not
        # be clinic-scoped. Apply standard DRF filter backends only; the per-clinic
        # gating for encounter sub-actions (visits/vitals) is applied in those actions.
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset
    
    def get_serializer_class(self):
        """Use lightweight serializer for list, full serializer for detail."""
        if self.action == 'list':
            return PatientListSerializer
        return PatientSerializer
    
    def perform_create(self, serializer):
        """Set created_by when creating a patient and log audit."""
        self.auto_set_facility(serializer)
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
        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError

        old_instance = self.get_object()
        new_category = serializer.validated_data.get("category")
        if (
            new_category
            and new_category != old_instance.category
            and requires_lifecycle_category_change(old_instance.category, new_category)
            and not can_manage_patient_lifecycle(self.request.user)
        ):
            raise PermissionDenied(
                "Only system administrators or department heads/deputies can convert employees to retiree."
            )
        if 'personal_number' in serializer.validated_data:
            new_pn = (serializer.validated_data.get('personal_number') or '').strip()
            old_pn = (old_instance.personal_number or '').strip()
            if new_pn != old_pn and not can_edit_personal_number(self.request.user):
                raise PermissionDenied(
                    'Only system administrators can change personal number.'
                )

        old_values = {
            'surname': old_instance.surname,
            'first_name': old_instance.first_name,
            'category': old_instance.category,
            'patient_id': old_instance.patient_id,
            'personal_number': old_instance.personal_number,
            'is_active': old_instance.is_active,
        }

        # Check if category is changing and regenerate patient ID if needed
        category_changed = 'category' in serializer.validated_data and serializer.validated_data['category'] != old_instance.category

        personal_number_changed = (
            'personal_number' in serializer.validated_data
            and (serializer.validated_data['personal_number'] or '').strip()
            != (old_instance.personal_number or '').strip()
        )

        dependents_updated = 0
        dependents_updated_pn = 0

        try:
            with transaction.atomic():
                patient = serializer.save(updated_by=self.request.user)

                if (
                    category_changed
                    and old_instance.category == 'employee'
                    and patient.category == 'retiree'
                ):
                    from .dependent_ids import sync_dependents_with_principal

                    dependents_updated = sync_dependents_with_principal(patient)

                if personal_number_changed and patient.category in ('employee', 'retiree'):
                    from .dependent_ids import sync_dependent_patient_ids

                    dependents_updated_pn = sync_dependent_patient_ids(patient)
        except DjangoValidationError as e:
            if hasattr(e, "message_dict"):
                raw = e.message_dict.get("patient_id", e.messages)
                message = raw[0] if isinstance(raw, list) else str(raw)
            else:
                message = str(e)
            raise DRFValidationError({"detail": message}) from e

        audit_description = (
            f'Updated patient: {patient.get_full_name()} ({patient.patient_id})'
        )
        if dependents_updated:
            audit_description += (
                f' — {dependents_updated} dependent(s) synced for retiree conversion'
            )
        if personal_number_changed:
            audit_description += (
                f' — personal number corrected'
                + (
                    f' ({dependents_updated_pn} dependent ID(s) synced)'
                    if dependents_updated_pn
                    else ''
                )
            )

        new_values = {
            'surname': patient.surname,
            'first_name': patient.first_name,
            'category': patient.category,
            'patient_id': patient.patient_id,
            'personal_number': patient.personal_number,
            'is_active': patient.is_active,
        }
        AuditService.log_patient_action(
            user=self.request.user,
            action='update',
            patient=patient,
            module='medical_records',
            description=audit_description,
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )
    
    def perform_destroy(self, instance):
        """Soft delete patient and log audit."""
        patient_id = instance.id
        patient_repr = instance.get_full_name()
        instance.is_active = False
        instance.updated_by = self.request.user
        instance.save(update_fields=['is_active', 'updated_by'])
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
        if not can_delete_patient(request.user):
            raise PermissionDenied('Only users with patient delete permission can delete patients.')
        return super().destroy(request, *args, **kwargs)
    
    @extend_schema(tags=["Patients"], summary="Counts", description="Return total and per-category patient counts (active only, not filtered by search/filters).")
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

    @extend_schema(tags=["Patients"], summary="Visits", description="Get all visits for a patient.")
    @action(detail=True, methods=['get'])
    def visits(self, request, pk=None):
        """Get all visits for a patient."""
        patient = self.get_object()
        qs = annotate_visit_history_flags(patient.visits.all()).order_by('-date', '-time')
        qs = self.scope_queryset(qs)
        serializer = VisitSerializer(qs, many=True)
        return Response(serializer.data)
    
    @extend_schema(tags=["Patients"], summary="Vitals", description="Get all vital readings for a patient.")
    @action(detail=True, methods=['get'])
    def vitals(self, request, pk=None):
        """Get all vital readings for a patient."""
        patient = self.get_object()
        qs = patient.vital_readings.all().order_by('-recorded_at')
        qs = self.scope_queryset(qs)
        serializer = VitalReadingSerializer(qs, many=True)
        return Response(serializer.data)
    
    @extend_schema(tags=["Patients"], summary="History", description="Get medical history for a patient.")
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Get medical history for a patient."""
        patient = self.get_object()
        history, created = MedicalHistory.objects.get_or_create(patient=patient)
        serializer = MedicalHistorySerializer(history)
        return Response(serializer.data)

    @extend_schema(tags=["Patients"], summary="Clinical overview", description="All clinical history slices for patient tabs / consultation room sidebar.")
    @action(detail=True, methods=['get'], url_path='clinical-overview')
    def clinical_overview(self, request, pk=None):
        """All clinical history slices for patient tabs / consultation room sidebar."""
        patient = self.get_object()
        from .clinical_overview import build_patient_clinical_overview

        return Response(build_patient_clinical_overview(patient))

    @extend_schema(tags=["Patients"], summary="Dependents counts", description="Batch dependent counts for principal staff IDs (comma-separated).")
    @action(detail=False, methods=['get'], url_path='dependents-counts')
    def dependents_counts(self, request):
        """Batch dependent counts for principal staff IDs (comma-separated)."""
        ids_param = request.query_params.get('principal_staff', '')
        ids: list[int] = []
        for part in ids_param.split(','):
            part = part.strip()
            if part.isdigit():
                ids.append(int(part))
        if not ids:
            return Response({})
        rows = (
            Patient.objects.filter(
                category='dependent',
                principal_staff_id__in=ids,
                is_active=True,
                merged_into__isnull=True,
            )
            .values('principal_staff_id')
            .annotate(count=Count('id'))
        )
        result = {str(i): 0 for i in ids}
        for row in rows:
            result[str(row['principal_staff_id'])] = row['count']
        return Response(result)

    @extend_schema(tags=["Patients"], summary="Update history", description="Update medical history for a patient.")
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

    @extend_schema(tags=["Patients"], summary="Promote", description="Promote a Staff employee to Officer with a new personal number.")
    @action(detail=True, methods=['patch'], url_path='promote')
    def promote(self, request, pk=None):
        """Promote a Staff employee to Officer with a new personal number."""
        if not can_manage_patient_lifecycle(request.user):
            raise PermissionDenied(
                'Only system administrators or department heads/deputies can promote patients to Officer.'
            )
        patient = self.get_object()
        if patient.category != 'employee':
            return Response({'error': 'Only Employee patients can be promoted.'}, status=status.HTTP_400_BAD_REQUEST)
        if (patient.employee_type or '').lower() != 'staff':
            return Response({'error': 'Only Staff employees can be promoted to Officer.'}, status=status.HTTP_400_BAD_REQUEST)

        new_personal_number = request.data.get('new_personal_number', '').strip()
        if not new_personal_number:
            return Response({'error': 'New personal number is required for promotion.'}, status=status.HTTP_400_BAD_REQUEST)

        from django.core.exceptions import ValidationError as DjangoValidationError
        from .validators import validate_personal_number_uniqueness
        try:
            validate_personal_number_uniqueness(new_personal_number, patient_id=patient.id, category='employee')
        except DjangoValidationError as e:
            message = e.message_dict.get('personal_number', [str(e)])[0] if hasattr(e, 'message_dict') else str(e)
            return Response({'error': message}, status=status.HTTP_400_BAD_REQUEST)

        old_values = {
            'employee_type': patient.employee_type,
            'personal_number': patient.personal_number,
            'patient_id': patient.patient_id,
        }

        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError
        from .dependent_ids import sync_dependents_with_principal

        try:
            with transaction.atomic():
                patient.employee_type = 'Officer'
                patient.personal_number = new_personal_number
                patient.updated_by = request.user
                patient.save()
                dependents_updated = sync_dependents_with_principal(patient)
        except DjangoValidationError as e:
            if hasattr(e, "message_dict"):
                raw = e.message_dict.get("patient_id", e.messages)
                message = raw[0] if isinstance(raw, list) else str(raw)
            else:
                message = str(e)
            return Response({'error': message}, status=status.HTTP_400_BAD_REQUEST)

        AuditService.log_patient_action(
            user=request.user,
            action='promote',
            patient=patient,
            module='medical_records',
            description=f'Promoted {patient.get_full_name()} from Staff to Officer (new PN: {new_personal_number})',
            old_values=old_values,
            new_values={
                'employee_type': patient.employee_type,
                'personal_number': patient.personal_number,
                'patient_id': patient.patient_id,
            },
            request=request,
        )

        serializer = self.get_serializer(patient)
        return Response({
            'patient': serializer.data,
            'dependents_updated': dependents_updated,
        })

    @extend_schema(tags=["Patients"], summary="Convert to csr", description="Convert a Retiree patient to NonNPA (CSR) along with their dependents.")
    @action(detail=True, methods=['patch'], url_path='convert-to-csr')
    def convert_to_csr(self, request, pk=None):
        """Convert a Retiree patient to NonNPA (CSR) along with their dependents."""
        if not can_manage_patient_lifecycle(request.user):
            raise PermissionDenied(
                'Only system administrators or department heads/deputies can convert patients to CSR.'
            )
        patient = self.get_object()
        if patient.category != 'retiree':
            return Response({'error': 'Only Retiree patients can be converted to CSR.'}, status=status.HTTP_400_BAD_REQUEST)

        # Find dependents before converting
        dependents = list(Patient.objects.filter(principal_staff=patient, category='dependent'))
        dependent_count = len(dependents)

        old_values = {
            'category': patient.category,
            'patient_id': patient.patient_id,
            'personal_number': patient.personal_number,
        }

        # Convert the retiree
        patient.category = 'nonnpa'
        patient.nonnpa_type = 'CSR'
        patient.personal_number = None
        patient.employee_type = None
        patient.division = None
        patient.location = None
        patient.updated_by = request.user
        patient.regenerate_patient_id()
        patient.save()

        # Convert dependents
        for dep in dependents:
            dep.category = 'nonnpa'
            dep.nonnpa_type = 'CSR'
            dep.dependent_type = None
            dep.principal_staff = None
            dep.personal_number = None
            dep.employee_type = None
            dep.division = None
            dep.location = None
            dep.updated_by = request.user
            dep.regenerate_patient_id()
            dep.save()

        AuditService.log_patient_action(
            user=request.user,
            action='convert_to_csr',
            patient=patient,
            module='medical_records',
            description=f'Converted {patient.get_full_name()} from Retiree to CSR ({dependent_count} dependent(s) also converted)',
            old_values=old_values,
            new_values={
                'category': patient.category,
                'patient_id': patient.patient_id,
                'nonnpa_type': patient.nonnpa_type,
            },
            request=request,
        )

        serializer = self.get_serializer(patient)
        return Response({
            'patient': serializer.data,
            'dependents_converted': dependent_count,
        })

    @extend_schema(tags=["Patients"], summary="Merge", description="Merge this patient INTO another patient (the loser is tombstoned).")
    @action(detail=True, methods=['post'], url_path='merge')
    def merge(self, request, pk=None):
        """Merge this patient INTO another patient (the loser is tombstoned).

        Body:
            {
              "winner_id":  <int>,     # The patient to keep (canonical record).
              "reason":     "<str>"    # Required. Audit-trail reason.
            }

        Effect:
            - All clinical FKs (visits, vitals, lab orders, prescriptions,
              consults, queue items, diagnoses, radiology, etc.) are
              re-pointed from this patient (the loser) to the winner.
            - Dependents of this patient are re-parented to the winner.
            - The OneToOne MedicalHistory is either re-pointed or merged.
            - Empty fields on the winner are filled from the loser.
            - The loser is tombstoned (patient_id='MERGED-{id}-{date}',
              is_active=False, merged_into=winner). A PatientMerge audit
              row is written with full snapshots.

        Permission: super admin or system administrator / admin staff.
        """
        if not can_merge_patient(request.user):
            raise PermissionDenied('You do not have permission to merge patients.')

        winner_id = request.data.get('winner_id')
        reason = (request.data.get('reason') or '').strip()
        if not winner_id:
            return Response({'error': 'winner_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not reason:
            return Response({'error': 'reason is required for audit.'}, status=status.HTTP_400_BAD_REQUEST)

        loser = self.get_object()
        if int(winner_id) == loser.id:
            return Response({'error': 'Cannot merge a record with itself.'}, status=status.HTTP_400_BAD_REQUEST)

        from django.core.exceptions import ValidationError as DjangoValidationError
        from .merge import merge_patients
        try:
            result = merge_patients(
                winner_id=int(winner_id),
                loser_id=loser.id,
                user=request.user,
                reason=reason,
            )
        except Patient.DoesNotExist:
            return Response({'error': f'Winner patient {winner_id} not found.'}, status=status.HTTP_404_NOT_FOUND)
        except DjangoValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied as e:
            raise e

        # Audit log entry for the patient module.
        AuditService.log_patient_action(
            user=request.user,
            action='merge',
            patient=loser,
            module='medical_records',
            description=(
                f'Merged patient {loser.patient_id} '
                f'(id={loser.id}, name={loser.get_full_name()}) into '
                f'patient_id={result["winner_patient_id"]} (id={result["winner_id"]}). '
                f'Reason: {reason}'
            ),
            old_values={'patient_id': result['loser_old_patient_id'], 'is_active': True},
            new_values={'patient_id': result['loser_new_patient_id'], 'is_active': False, 'merged_into': result['winner_id']},
            request=request,
        )

        winner = Patient.objects.get(pk=result['winner_id'])
        return Response({
            'winner_id': result['winner_id'],
            'winner_patient_id': result['winner_patient_id'],
            'loser_id': result['loser_id'],
            'loser_old_patient_id': result['loser_old_patient_id'],
            'loser_new_patient_id': result['loser_new_patient_id'],
            'counters': result['counters'],
            'merge_audit_id': result['merge_audit_id'],
            'winner': self.get_serializer(winner).data,
        })

    @extend_schema(tags=["Patients"], summary="Merge audit", description="Return the merge-audit rows where this patient is either winner or loser.")
    @action(detail=True, methods=['get'], url_path='merge-audit')
    def merge_audit(self, request, pk=None):
        """Return the merge-audit rows where this patient is either winner or loser."""
        from .models import PatientMerge
        rows = PatientMerge.objects.filter(
            Q(winner_id=pk) | Q(loser_id=pk)
        ).order_by('-merged_at')
        data = [{
            'id': r.id,
            'winner_id': r.winner_id,
            'winner_patient_id': r.winner.patient_id,
            'loser_id': r.loser_id,
            'loser_patient_id': r.loser.patient_id,
            'merged_at': r.merged_at,
            'merged_by': r.merged_by.username if r.merged_by else None,
            'reason': r.reason,
            'has_repointed_rows': bool(r.repointed_rows),
            'counters': {k: v for k, v in r.__dict__.items() if k.endswith('_repointed') or k.endswith('_merged')},
        } for r in rows]
        return Response(data)

    @extend_schema(
        tags=["Patients"],
        summary="Records notes",
        description="List or append Medical Records administrative notes for a patient.",
    )
    @action(detail=True, methods=['get', 'post'], url_path='records-notes')
    def records_notes(self, request, pk=None):
        patient = self.get_object()
        if request.method == 'GET':
            notes = patient.records_notes.select_related('recorded_by').all()
            return Response(PatientRecordsNoteSerializer(notes, many=True).data)

        note_text = (request.data.get('note') or '').strip()
        if not note_text:
            return Response({'detail': 'Note is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(note_text) > 800:
            return Response(
                {'detail': 'Note must be 800 characters or fewer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        try:
            name = user.get_full_name() or getattr(user, 'username', '') or ''
        except Exception:
            name = str(user)

        note = PatientRecordsNote.objects.create(
            patient=patient,
            note=note_text[:800],
            source='manual',
            recorded_by=user if getattr(user, 'is_authenticated', False) else None,
            recorded_by_name_snapshot=name,
        )
        AuditService.log_patient_action(
            user=user,
            action='update',
            patient=patient,
            module='medical_records',
            description=f'Added records note for {patient.get_full_name()} ({patient.patient_id})',
            new_values={'records_note_id': note.id},
            request=request,
        )
        return Response(PatientRecordsNoteSerializer(note).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=["Patients"],
        summary="Clinical documents",
        description="List or upload scanned/external clinical documents for a patient.",
    )
    @action(
        detail=True,
        methods=['get', 'post'],
        url_path='clinical-documents',
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def clinical_documents(self, request, pk=None):
        patient = self.get_object()
        if request.method == 'GET':
            docs = (
                patient.clinical_documents.select_related('uploaded_by', 'referral')
                .all()
            )
            doc_type = (request.query_params.get('doc_type') or '').strip()
            if doc_type:
                docs = docs.filter(doc_type=doc_type)
            return Response(PatientClinicalDocumentSerializer(docs, many=True, context={'request': request}).data)

        serializer = PatientClinicalDocumentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        referral = None
        referral_raw = request.data.get('referral')
        if referral_raw not in (None, '', 'null'):
            try:
                referral_pk = int(referral_raw)
            except (TypeError, ValueError):
                return Response({'detail': 'Invalid referral id.'}, status=status.HTTP_400_BAD_REQUEST)
            from consultation.models import Referral
            referral = Referral.objects.filter(pk=referral_pk, patient_id=patient.id).first()
            if referral is None:
                return Response(
                    {'detail': 'Referral not found for this patient.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        upload = serializer.validated_data['file']
        original_name = getattr(upload, 'name', '') or ''

        user = request.user
        name = _snapshot_actor_name(user)
        mirror_into_results = _boolish(request.data.get('mirror_into_results'))

        with transaction.atomic():
            doc = PatientClinicalDocument.objects.create(
                patient=patient,
                doc_type=serializer.validated_data['doc_type'],
                source=serializer.validated_data.get('source') or 'scanned_paper',
                document_date=serializer.validated_data['document_date'],
                title=(serializer.validated_data.get('title') or '').strip()[:200],
                facility=(serializer.validated_data.get('facility') or '').strip()[:200],
                clinician_name=(serializer.validated_data.get('clinician_name') or '').strip()[:200],
                notes=(serializer.validated_data.get('notes') or '').strip()[:500],
                file=upload,
                original_filename=original_name[:255],
                referral=referral,
                uploaded_by=user if getattr(user, 'is_authenticated', False) else None,
                uploaded_by_name_snapshot=name,
            )

            mirror_summary = {}
            if mirror_into_results and doc.doc_type in ('lab', 'radiology'):
                mirror_summary = _mirror_clinical_document_into_result_tabs(
                    patient=patient,
                    doc=doc,
                    referral=referral,
                    actor=user,
                )

            close_referral = _boolish(request.data.get('close_referral'))
            if close_referral and referral is not None and referral.status in ('approved_for_forms', 'scheduled'):
                referral.status = 'closed'
                referral.closed_at = timezone.now()
                referral.save(update_fields=['status', 'closed_at'])

        AuditService.log_patient_action(
            user=user,
            action='update',
            patient=patient,
            module='medical_records',
            description=(
                f'Uploaded clinical document ({doc.doc_type}) for '
                f'{patient.get_full_name()} ({patient.patient_id})'
            ),
            new_values={
                'clinical_document_id': doc.id,
                'doc_type': doc.doc_type,
                **mirror_summary,
            },
            request=request,
        )
        return Response(
            PatientClinicalDocumentSerializer(doc, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        tags=["Patients"],
        summary="Bulk clinical documents",
        description="Upload multiple scanned documents for one patient with shared metadata.",
    )
    @action(
        detail=True,
        methods=['post'],
        url_path='clinical-documents-bulk',
        parser_classes=[MultiPartParser, FormParser],
    )
    def clinical_documents_bulk(self, request, pk=None):
        patient = self.get_object()
        uploads = request.FILES.getlist('files')
        if not uploads:
            return Response({'detail': 'At least one file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        name = _snapshot_actor_name(user)
        mirror_into_results = _boolish(request.data.get('mirror_into_results'))
        close_referral = _boolish(request.data.get('close_referral'))

        referral = None
        referral_raw = request.data.get('referral')
        if referral_raw not in (None, '', 'null'):
            try:
                referral_pk = int(referral_raw)
            except (TypeError, ValueError):
                return Response({'detail': 'Invalid referral id.'}, status=status.HTTP_400_BAD_REQUEST)
            from consultation.models import Referral
            referral = Referral.objects.filter(pk=referral_pk, patient_id=patient.id).first()
            if referral is None:
                return Response(
                    {'detail': 'Referral not found for this patient.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        shared = {
            'doc_type': request.data.get('doc_type'),
            'source': request.data.get('source') or 'scanned_paper',
            'document_date': request.data.get('document_date'),
            'title': request.data.get('title'),
            'facility': request.data.get('facility'),
            'clinician_name': request.data.get('clinician_name'),
            'notes': request.data.get('notes'),
            'referral': referral.id if referral else None,
        }

        created_docs = []
        with transaction.atomic():
            for upload in uploads:
                serializer = PatientClinicalDocumentSerializer(
                    data={**shared, 'file': upload},
                    context={'request': request},
                )
                serializer.is_valid(raise_exception=True)
                doc = PatientClinicalDocument.objects.create(
                    patient=patient,
                    doc_type=serializer.validated_data['doc_type'],
                    source=serializer.validated_data.get('source') or 'scanned_paper',
                    document_date=serializer.validated_data['document_date'],
                    title=(serializer.validated_data.get('title') or '').strip()[:200],
                    facility=(serializer.validated_data.get('facility') or '').strip()[:200],
                    clinician_name=(serializer.validated_data.get('clinician_name') or '').strip()[:200],
                    notes=(serializer.validated_data.get('notes') or '').strip()[:500],
                    file=serializer.validated_data['file'],
                    original_filename=(getattr(upload, 'name', '') or '')[:255],
                    referral=referral,
                    uploaded_by=user if getattr(user, 'is_authenticated', False) else None,
                    uploaded_by_name_snapshot=name,
                )
                if mirror_into_results and doc.doc_type in ('lab', 'radiology'):
                    _mirror_clinical_document_into_result_tabs(
                        patient=patient,
                        doc=doc,
                        referral=referral,
                        actor=user,
                    )
                created_docs.append(doc)

            if close_referral and referral is not None and referral.status in ('approved_for_forms', 'scheduled'):
                referral.status = 'closed'
                referral.closed_at = timezone.now()
                referral.save(update_fields=['status', 'closed_at'])

        AuditService.log_patient_action(
            user=user,
            action='update',
            patient=patient,
            module='medical_records',
            description=(
                f'Bulk uploaded {len(created_docs)} clinical document(s) for '
                f'{patient.get_full_name()} ({patient.patient_id})'
            ),
            new_values={
                'clinical_document_ids': [doc.id for doc in created_docs],
                'doc_type': shared['doc_type'],
                'bulk_count': len(created_docs),
            },
            request=request,
        )
        return Response(
            PatientClinicalDocumentSerializer(
                created_docs,
                many=True,
                context={'request': request},
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(tags=["Patients"], summary="Unmerge", description="Reverse a previous merge. Admin-only emergency undo.")
    @action(detail=True, methods=['post'], url_path='unmerge')
    def unmerge(self, request, pk=None):
        """Reverse a previous merge. Admin-only emergency undo.

        Body:
            {
              "merge_audit_id": <int>   # Required. The PatientMerge audit row to reverse.
            }

        Effect:
            - Clinical FKs are re-pointed back from the winner to the loser.
            - The loser's tombstone record is restored (patient_id, is_active,
              merged_into, etc.).
            - An un-merge audit row is written.
        """
        if not can_unmerge_patient(request.user):
            raise PermissionDenied('You do not have permission to un-merge patients.')

        from .models import PatientMerge

        audit_id = request.data.get('merge_audit_id')
        if not audit_id:
            return Response(
                {'error': 'merge_audit_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify the audit row involves this patient as the winner.
        try:
            audit = PatientMerge.objects.get(pk=audit_id)
        except PatientMerge.DoesNotExist:
            return Response(
                {'error': f'Merge audit row {audit_id} not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if audit.winner_id != int(pk):
            return Response(
                {'error': 'This patient is not the winner in the specified merge row.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.core.exceptions import ValidationError as DjangoValidationError
        from .merge import unmerge_patients
        try:
            result = unmerge_patients(audit_id=audit_id, user=request.user)
        except DjangoValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied as e:
            raise e

        # Audit log.
        AuditService.log_patient_action(
            user=request.user,
            action='merge',
            patient=audit.loser,
            module='medical_records',
            description=(
                f'UNMERGED: Reversed merge #{audit.id} '
                f'({audit.loser.patient_id} → {audit.winner.patient_id}). '
                f'Loser restored as {result["loser_patient_id"]}.'
            ),
            old_values={'merged_into': audit.winner.patient_id, 'is_active': False},
            new_values={'merged_into': None, 'is_active': True, 'patient_id': result['loser_patient_id']},
            request=request,
        )

        return Response(result)


@extend_schema_view(
    list=extend_schema(summary="List visits", tags=["Visits"]),
    retrieve=extend_schema(summary="Retrieve visit", tags=["Visits"]),
    create=extend_schema(summary="Create visit", tags=["Visits"]),
    update=extend_schema(summary="Update visit", tags=["Visits"]),
    partial_update=extend_schema(summary="Partially update visit", tags=["Visits"]),
    destroy=extend_schema(summary="Cancel or remove visit", tags=["Visits"]),
)
class VisitViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing patient visits.
    """
    serializer_class = VisitSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    # status is applied in get_queryset so nursing_pool can include completed visits
    # without DjangoFilterBackend's status=in_progress wiping them.
    filterset_fields = ['patient', 'visit_type', 'clinic']
    search_fields = ['visit_id', 'clinical_notes', 'patient__surname', 'patient__first_name', 'patient__patient_id']
    ordering_fields = ['date', 'time', 'created_at']
    ordering = ['-date', '-time']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Visit.objects.none()
        
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

        nursing_status = (self.request.query_params.get('nursing_status') or '').strip()
        nursing_pool = self.request.query_params.get('nursing_pool') == '1'
        status_param = (self.request.query_params.get('status') or '').strip()

        if nursing_pool:
            queryset = apply_nursing_pool_visit_status_scope(queryset, self.request)
        elif nursing_status:
            if nursing_status.lower() == 'completed':
                queryset = queryset.filter(status__in=['in_progress', 'completed'])
            else:
                # Nursing workflow only applies after MR forwards the visit.
                queryset = queryset.filter(status='in_progress')
        elif status_param:
            queryset = queryset.filter(status=status_param)

        queryset = annotate_visit_history_flags(queryset)

        if nursing_status:
            queryset = apply_nursing_status_filter(queryset, nursing_status, self.request)

        return self.scope_queryset(queryset)

    @extend_schema(tags=["Visits"], summary="Resolve", description="Return the best-matching visit for a patient (e.g. latest or in-progress).")
    @action(detail=False, methods=['get'], url_path='resolve')
    def resolve_visit(self, request):
        """Return the best-matching visit for a patient (e.g. latest or in-progress)."""
        patient_id = request.query_params.get('patient')
        if not patient_id:
            return Response({'detail': 'patient is required'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.filter_queryset(self.get_queryset()).filter(patient_id=patient_id)
        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        ordering = (request.query_params.get('ordering') or '-date,-time').strip()
        order_fields = [f.strip() for f in ordering.split(',') if f.strip()]
        if order_fields:
            qs = qs.order_by(*order_fields)
        visit = qs.first()
        if not visit:
            return Response({'detail': 'Visit not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(visit).data)

    @extend_schema(tags=["Visits"], summary="Workspace bundle", description="Diagnoses, orders, prescriptions, and vitals for a visit in one request.")
    @action(detail=True, methods=['get'], url_path='workspace-bundle')
    def workspace_bundle(self, request, pk=None):
        """Diagnoses, orders, prescriptions, and vitals for a visit in one request."""
        visit = self.get_object()
        from .visit_bundle import build_visit_workspace_bundle

        return Response(build_visit_workspace_bundle(visit))

    @extend_schema(tags=["Visits"], summary="Nursing pool metrics", description="Aggregate counts for nursing pool dashboard cards (same filters as list: date, search, clinic, type, nursing_pool).")
    @action(detail=False, methods=['get'], url_path='nursing-pool-metrics')
    def nursing_pool_metrics(self, request):
        """
        Aggregate counts for nursing pool dashboard cards (same filters as list: date, search, clinic, type, nursing_pool).

        Cards are MUTUALLY EXCLUSIVE so the math works
        (pending + ready + in_consultation + completed = total):
          - total:                  all non-cancelled today
          - pending_vitals:         no vitals AND not in queue/session AND not completed
          - ready_for_consultation: complete vitals AND not in queue/session AND not completed
          - in_consultation:        in active queue OR has non-cancelled session, AND not completed
          - completed:              visit.status='completed' OR session.status='completed'
        """
        from consultation.models import ConsultationQueue, ConsultationSession

        base = _nursing_pool_base_queryset_for_metrics(self, request)
        # Exclude status='completed' from the active buckets so the math sums cleanly.
        active = base.exclude(status='completed')
        visit_ids = list(active.values_list('id', flat=True))
        in_queue_ids = set(
            ConsultationQueue.objects.filter(is_active=True, visit_id__in=visit_ids)
            .values_list('visit_id', flat=True)
        )
        session_visit_ids = set(
            ConsultationSession.objects.filter(
                visit_id__in=visit_ids,
                status__in=['active', 'paused'],
            ).values_list('visit_id', flat=True)
        )
        in_consultation_ids = in_queue_ids | session_visit_ids
        in_consultation = sum(1 for vid in visit_ids if vid in in_consultation_ids)
        completed = base.filter(
            Q(status='completed')
            | Exists(
                ConsultationSession.objects.filter(
                    visit_id=OuterRef('pk'),
                    status='completed',
                )
            )
        ).count()
        return Response(
            {
                'total': base.count(),
                'pending_vitals': apply_nursing_status_filter(base, 'pending', request).count(),
                'ready_for_consultation': apply_nursing_status_filter(base, 'ready', request).count(),
                'in_consultation': in_consultation,
                'completed': completed,
            }
        )

    @extend_schema(tags=["Visits"], summary="List stats", description="Tab counts for visits list (replaces 4 parallel COUNT requests).")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Tab counts for visits list (replaces 4 parallel COUNT requests)."""
        from common.list_stats import aggregate_status_counts, viewset_queryset_excluding_params

        qs = viewset_queryset_excluding_params(self, frozenset({'status', 'page', 'page_size', 'ordering'}))
        return Response(
            aggregate_status_counts(
                qs,
                'status',
                {
                    'scheduled': 'scheduled',
                    'inProgress': 'in_progress',
                    'completed': 'completed',
                },
            )
        )

    @extend_schema(tags=["Visits"], summary="Nursing pool analytics", description="Rich nursing pool report: daily trends, vitals_incomplete, aligned vs queue-date sent_to_room,")
    @action(detail=False, methods=['get'], url_path='nursing-pool-analytics')
    def nursing_pool_analytics(self, request):
        """
        Rich nursing pool report: daily trends, vitals_incomplete, aligned vs queue-date sent_to_room,
        multi-clinic counts, eye/physio route + check-in counts (same base filters as list + metrics).
        """
        base = _nursing_pool_base_queryset_for_metrics(self, request)
        from .nursing_analytics import build_nursing_pool_analytics_response

        body = build_nursing_pool_analytics_response(self, request, base)
        date = request.query_params.get('date')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        period = {}
        if date:
            period = {'start': date, 'end': date}
        elif start_date or end_date:
            period = {'start': start_date or '', 'end': end_date or ''}
        return Response({**body, 'period': period})

    @extend_schema(tags=["Visits"], summary="Nursing flow analytics", description="Patient flow efficiency analytics: processing times, throughput, bottlenecks.")
    @action(detail=False, methods=['get'], url_path='nursing-flow-analytics')
    def nursing_flow_analytics(self, request):
        """
        Patient flow efficiency analytics: processing times, throughput, bottlenecks.
        Requires start and end date parameters.
        """
        from common.module_analytics import parse_analytics_dates
        dates = parse_analytics_dates(request)
        if isinstance(dates, Response):
            return dates

        start_date, end_date, _all_time = dates
        base = _nursing_pool_base_queryset_for_metrics(self, request)

        from .nursing_analytics import build_patient_flow_analytics
        analytics = build_patient_flow_analytics(base, start_date, end_date)

        return Response(analytics)

    @extend_schema(tags=["Visits"], summary="Nursing vitals analytics", description="Vitals quality analytics: completion rates, accuracy, error analysis.")
    @action(detail=False, methods=['get'], url_path='nursing-vitals-analytics')
    def nursing_vitals_analytics(self, request):
        """
        Vitals quality analytics: completion rates, accuracy, error analysis.
        Requires start and end date parameters.
        """
        from common.module_analytics import parse_analytics_dates
        dates = parse_analytics_dates(request)
        if isinstance(dates, Response):
            return dates

        start_date, end_date, _all_time = dates
        base = _nursing_pool_base_queryset_for_metrics(self, request)

        from .nursing_analytics import build_vitals_quality_analytics
        analytics = build_vitals_quality_analytics(base, start_date, end_date)

        return Response(analytics)

    @extend_schema(tags=["Visits"], summary="Nursing wait times", description="Wait time analytics: distribution, peak times, priority impact.")
    @action(detail=False, methods=['get'], url_path='nursing-wait-times')
    def nursing_wait_times(self, request):
        """
        Wait time analytics: distribution, peak times, priority impact.
        Requires start and end date parameters.
        """
        from common.module_analytics import parse_analytics_dates
        dates = parse_analytics_dates(request)
        if isinstance(dates, Response):
            return dates

        start_date, end_date, _all_time = dates
        base = _nursing_pool_base_queryset_for_metrics(self, request)

        from .nursing_analytics import build_wait_time_analytics
        analytics = build_wait_time_analytics(base, start_date, end_date)

        return Response(analytics)

    @extend_schema(tags=["Visits"], summary="Nursing comprehensive analytics", description="Comprehensive nursing analytics combining all metrics.")
    @action(detail=False, methods=['get'], url_path='nursing-comprehensive-analytics')
    def nursing_comprehensive_analytics(self, request):
        """
        Comprehensive nursing analytics combining all metrics.
        Requires start and end date parameters.
        """
        from common.module_analytics import parse_analytics_dates
        dates = parse_analytics_dates(request)
        if isinstance(dates, Response):
            return dates

        start_date, end_date, _all_time = dates
        # Comprehensive report should be period-based (visit calendar date), not
        # constrained by pool snapshot rules from the queue page.
        base = (
            Visit.objects
            .all()
            .select_related('patient', 'doctor', 'created_by')
            .prefetch_related('vital_readings')
            .filter(date__gte=start_date.date(), date__lte=end_date.date())
            .exclude(status='cancelled')
        )
        base = annotate_visit_history_flags(base)
        base = self.scope_queryset(base)

        from .nursing_analytics import build_comprehensive_nursing_analytics
        analytics = build_comprehensive_nursing_analytics(base, start_date, end_date)

        return Response(analytics)

    def perform_update(self, serializer):
        """
        Update visit and emit workflow notifications when status changes.

        - Medical Records -> Nursing Pool: when a visit is moved to `in_progress`,
          notify all Nursing Officers to take vitals.
        """
        old_instance = self.get_object()
        old_status = old_instance.status

        self.auto_set_facility(serializer)

        visit = serializer.save()

        if old_status != visit.status and visit.status in ('completed', 'cancelled'):
            terminal = 'completed' if visit.status == 'completed' else 'cancelled'
            summary = finalize_consultation_artifacts_for_visit(
                visit,
                session_terminal_status=terminal,
            )
            if summary['sessions_updated'] or summary['queue_items_deactivated']:
                AuditService.log_activity(
                    user=self.request.user,
                    action='update',
                    object_type='visit',
                    object_id=str(visit.id),
                    module='medical_records',
                    object_repr=f'Visit {visit.visit_id}',
                    description=(
                        f'Synced consultation queue/session rows after visit status '
                        f'{old_status} -> {visit.status}: {summary}'
                    ),
                    old_values={'status': old_status},
                    new_values={'status': visit.status, **summary},
                    request=self.request,
                )

        try:
            new_status = visit.status
            if old_status != new_status and new_status == 'in_progress':
                from notifications.services import NotificationService

                patient_name = visit.patient.get_full_name()
                title = "Patient sent to Nursing"
                message = f"{patient_name} ({visit.visit_id}) has been sent to Nursing for vitals."

                # Patient is now in the nursing pool waiting on vitals
                # — the nurse on duty should know promptly.
                NotificationService.notify_role(
                    role_name='Nursing Officer',
                    title=title,
                    message=message,
                    notification_type='workflow',
                    priority='high',
                    action_url='/nursing/pool-queue',
                    object_type='visit',
                    object_id=str(visit.id),
                    clinic_id=getattr(self.request.user, 'clinic_id', None),
                )
        except Exception:
            # Notifications must never break core workflow actions
            pass
    
    def perform_create(self, serializer):
        """Set created_by when creating a visit and log audit."""
        self.auto_set_facility(serializer)
        visit = serializer.save(created_by=self.request.user)
        if visit.visit_type == "annual_checkup":
            create_annual_checkup_for_visit(visit)
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

    @extend_schema(tags=["Visits"], summary="Close workflow")
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


@extend_schema_view(
    list=extend_schema(summary="List vital readings", tags=["Vitals"]),
    retrieve=extend_schema(summary="Retrieve vital reading", tags=["Vitals"]),
    create=extend_schema(summary="Record vitals", tags=["Vitals"]),
    update=extend_schema(summary="Update vitals", tags=["Vitals"]),
    partial_update=extend_schema(summary="Partially update vitals", tags=["Vitals"]),
    destroy=extend_schema(summary="Delete vital reading", tags=["Vitals"]),
)
class VitalReadingViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing vital readings.
    """
    
    facility_filter_field = 'visit__location_clinic'
    serializer_class = VitalReadingSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'visit']
    search_fields = [
        'patient__first_name',
        'patient__surname',
        'patient__patient_id',
        'patient__personal_number',
        'recorded_by__first_name',
        'recorded_by__last_name',
    ]
    ordering_fields = ['recorded_at']
    ordering = ['-recorded_at']

    def _apply_history_filters(self, qs):
        gender = (self.request.query_params.get('patient_gender') or '').strip().lower()
        if gender in ('male', 'female'):
            qs = qs.filter(patient__gender=gender)

        from common.report_period import apply_date_preset

        df = (self.request.query_params.get('date_filter') or '').strip().lower()
        qs = apply_date_preset(qs, df, 'recorded_at')

        after = (self.request.query_params.get('recorded_at_after') or '').strip()
        before = (self.request.query_params.get('recorded_at_before') or '').strip()
        if after:
            qs = qs.filter(recorded_at__date__gte=after)
        if before:
            qs = qs.filter(recorded_at__date__lte=before)

        return qs
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return VitalReading.objects.none()
        
        qs = self.scope_queryset(
            VitalReading.objects.all().select_related(
                'patient', 'visit', 'visit__location_clinic', 'recorded_by'
            )
        )
        return self._apply_history_filters(qs)

    @extend_schema(tags=["Vitals"], summary="History patients", description="Paginated patient summaries for vitals history (one row per patient).")
    @action(detail=False, methods=['get'], url_path='history-patients')
    def history_patients(self, request):
        """Paginated patient summaries for vitals history (one row per patient)."""
        qs = self.filter_queryset(self.get_queryset())
        grouped = (
            qs.values(
                'patient',
                'patient__patient_id',
                'patient__first_name',
                'patient__surname',
                'patient__gender',
                'patient__date_of_birth',
            )
            .annotate(
                reading_count=Count('id'),
                last_recorded_at=Max('recorded_at'),
            )
            .order_by('-last_recorded_at')
        )

        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = min(max(1, int(request.query_params.get('page_size', 50))), 100)
        except (TypeError, ValueError):
            page_size = 50

        total = grouped.count()
        start = (page - 1) * page_size
        rows = list(grouped[start:start + page_size])

        patient_ids = [row['patient'] for row in rows]
        photo_by_patient: dict[int, str | None] = {}
        if patient_ids:
            for patient in Patient.objects.filter(id__in=patient_ids).only('id', 'photo'):
                photo_by_patient[patient.id] = patient_photo_url(patient)

        latest_by_patient: dict[int, VitalReading] = {}
        if patient_ids:
            for vital in qs.filter(patient_id__in=patient_ids).order_by('patient_id', '-recorded_at'):
                if vital.patient_id not in latest_by_patient:
                    latest_by_patient[vital.patient_id] = vital

        results = []
        for row in rows:
            pid = row['patient']
            latest = latest_by_patient.get(pid)
            name_parts = [
                row.get('patient__first_name') or '',
                row.get('patient__surname') or '',
            ]
            results.append({
                'patient': pid,
                'patient_id': row.get('patient__patient_id') or '',
                'patient_name': ' '.join(part for part in name_parts if part).strip(),
                'patient_photo': photo_by_patient.get(pid),
                'patient_gender': row.get('patient__gender') or '',
                'patient_date_of_birth': row.get('patient__date_of_birth'),
                'reading_count': row['reading_count'],
                'last_recorded_at': row['last_recorded_at'],
                'latest_bp_systolic': latest.blood_pressure_systolic if latest else None,
                'latest_bp_diastolic': latest.blood_pressure_diastolic if latest else None,
            })

        return Response({'count': total, 'results': results})

    @extend_schema(tags=["Vitals"], summary="History stats", description="Dashboard cards for vitals history (replaces 4 parallel COUNT list calls).")
    @action(detail=False, methods=['get'], url_path='history-stats')
    def history_stats(self, request):
        """Dashboard cards for vitals history (replaces 4 parallel COUNT list calls)."""
        from common.list_stats import viewset_queryset_excluding_params
        from common.report_period import apply_date_preset

        full_qs = self.filter_queryset(self.get_queryset())
        without_date = viewset_queryset_excluding_params(
            self,
            frozenset({
                'date_filter',
                'recorded_at_after',
                'recorded_at_before',
                'page',
                'page_size',
                'ordering',
            }),
        )
        today_qs = apply_date_preset(without_date, 'today', 'recorded_at')
        week_qs = apply_date_preset(without_date, 'week', 'recorded_at')

        return Response({
            'total': full_qs.count(),
            'today': today_qs.count(),
            'week': week_qs.count(),
            'patients': full_qs.values('patient').distinct().count(),
        })

    @extend_schema(tags=["Vitals"], summary="Latest by visits", description="Return latest vital reading per visit for a CSV list of visit IDs.")
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
            self.get_queryset()
            .filter(visit_id__in=visit_ids)
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

    @extend_schema(tags=["Vitals"], summary="Resolve", description="Return the best-matching vital reading (latest by default).")
    @action(detail=False, methods=['get'], url_path='resolve')
    def resolve_vital(self, request):
        """Return the best-matching vital reading (latest by default)."""
        patient_id = request.query_params.get('patient')
        visit_id = request.query_params.get('visit')
        if not patient_id and not visit_id:
            return Response({'detail': 'patient or visit is required'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.filter_queryset(self.get_queryset())
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        if visit_id:
            qs = qs.filter(visit_id=visit_id)
        ordering = (request.query_params.get('ordering') or '-recorded_at').strip()
        order_fields = [f.strip() for f in ordering.split(',') if f.strip()]
        if order_fields:
            qs = qs.order_by(*order_fields)
        vital = qs.first()
        if not vital:
            return Response({'detail': 'Vital reading not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(vital).data)

    @extend_schema(tags=["Vitals"], summary="Exists", description="Whether a visit has at least one vital reading.")
    @action(detail=False, methods=['get'], url_path='exists')
    def exists_for_visit(self, request):
        """Whether a visit has at least one vital reading."""
        visit_id = request.query_params.get('visit')
        if not visit_id:
            return Response({'detail': 'visit is required'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.filter_queryset(self.get_queryset()).filter(visit_id=visit_id)
        return Response({'exists': qs.exists()})
    
    def _assert_visit_open(self, visit, action: str):
        """Block mutation of vitals once a visit is in a terminal state.

        Closed medical records should not be edited through the regular
        vitals endpoint — amendments require a separate audited workflow.
        Raises ValidationError so DRF returns a clean 400 to the client.
        """
        from rest_framework.exceptions import ValidationError
        if visit is None:
            return
        if visit.status in ('completed', 'cancelled'):
            raise ValidationError({
                'visit': f'Cannot {action} vitals: visit is {visit.status}.',
            })

    def perform_create(self, serializer):
        """Set recorded_by and block creation on closed visits."""
        self._assert_visit_open(serializer.validated_data.get('visit'), 'record')
        serializer.save(recorded_by=self.request.user)

    def perform_update(self, serializer):
        self._assert_visit_open(serializer.instance.visit, 'edit')
        serializer.save()

    def perform_destroy(self, instance):
        self._assert_visit_open(instance.visit, 'delete')
        instance.delete()


@document_viewset(tag="Patients", resource="medical certificates")
class MedicalCertificateViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """
    Persisted medical certificates.
    Created from consultation or Medical Records; PDF via GET .../pdf/ (NPA house style).
    """
    serializer_class = MedicalCertificateSerializer
    facility_filter_field = "patient__location_clinic"
    pagination_class = MedicalCertificatePagination
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    ordering_fields = ["issued_at", "valid_from", "valid_to", "certificate_number"]
    ordering = ["-issued_at"]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return MedicalCertificate.objects.none()
        
        queryset = MedicalCertificate.objects.all().select_related("patient", "issued_by")
        patient_id = self.request.query_params.get("patient")
        if patient_id:
            queryset = queryset.filter(patient__id=patient_id)
        return queryset.order_by(*self.ordering)

    def perform_create(self, serializer):
        # Stamp who issued the certificate (doctor) - DB snapshot fields are handled in the model.
        from permissions.user_capabilities import ensure_capability

        ensure_capability(
            self.request.user,
            "medical_certificate_issue",
            "Only authorised staff can issue medical certificates.",
        )
        serializer.save(issued_by=self.request.user)

    @extend_schema(tags=["Patients"], summary="Pdf", description="Download medical certificate as PDF (NPA house style).")
    @action(detail=True, methods=["get"], url_path="pdf")
    def download_pdf(self, request, pk=None):
        """Download medical certificate as PDF (NPA house style)."""
        certificate = self.get_object()
        from .medical_certificate_pdf import build_medical_certificate_pdf

        return build_medical_certificate_pdf(certificate)


@document_viewset(tag="HR", resource="annual checkups")
class AnnualCheckupViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """
    Annual employee check-up programme records.

    Linked 1:1 to visits with visit_type=annual_checkup.
    """

    facility_filter_field = "visit__location_clinic"
    serializer_class = AnnualCheckupSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["patient", "status", "programme_year", "visit"]
    ordering_fields = ["programme_year", "created_at", "signed_off_at"]
    ordering = ["-programme_year", "-created_at"]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return AnnualCheckup.objects.none()
        
        qs = AnnualCheckup.objects.select_related(
            "patient",
            "visit",
            "signed_off_by",
        )
        return self.scope_queryset(qs)

    @extend_schema(tags=["HR"], summary="Resolve", description="Single annual check-up by visit and/or patient + programme year.")
    @action(detail=False, methods=['get'], url_path='resolve')
    def resolve_checkup(self, request):
        """Single annual check-up by visit and/or patient + programme year."""
        qs = self.filter_queryset(self.get_queryset())
        visit_id = request.query_params.get('visit')
        patient_id = request.query_params.get('patient')
        programme_year = request.query_params.get('programme_year')
        if visit_id:
            qs = qs.filter(visit_id=visit_id)
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        if programme_year:
            qs = qs.filter(programme_year=programme_year)
        checkup = qs.first()
        if not checkup:
            return Response({'detail': 'Annual check-up not found'}, status=status.HTTP_404_NOT_FOUND)
        if checkup.status != 'completed':
            refresh_components_completed(checkup)
        return Response(AnnualCheckupSerializer(checkup).data)

    def get_serializer_class(self):
        if self.action == "create":
            return AnnualCheckupCreateSerializer
        if self.action == "sign_off":
            return AnnualCheckupSignOffSerializer
        return AnnualCheckupSerializer

    def create(self, request, *args, **kwargs):
        serializer = AnnualCheckupCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        visit = serializer.validated_data["visit"]
        programme_year = serializer.validated_data.get("programme_year")
        checkup = create_annual_checkup_for_visit(visit, programme_year=programme_year)
        refresh_components_completed(checkup)
        AuditService.log_activity(
            user=request.user,
            action="create",
            object_type="annual_checkup",
            object_id=str(checkup.id),
            module="patients",
            object_repr=f"Annual check-up {checkup.programme_year}",
            description=f"Created annual check-up for {checkup.patient.get_full_name()}",
            request=request,
        )
        return Response(
            AnnualCheckupSerializer(checkup).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        checkup = self.get_object()
        if checkup.status == "completed":
            return Response(
                {"detail": "Completed check-ups cannot be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed = {"fitness_outcome", "outcome_notes", "component_overrides", "components_required"}
        data = {k: v for k, v in request.data.items() if k in allowed}
        if "components_required" in data:
            data["components_required"] = validate_selected_component_codes(
                data["components_required"]
            )
        serializer = AnnualCheckupSerializer(checkup, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        checkup = serializer.save()
        refresh_components_completed(checkup)
        return Response(AnnualCheckupSerializer(checkup).data)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        if request.query_params.get("visit"):
            for checkup in queryset:
                if checkup.status != "completed":
                    refresh_components_completed(checkup)
                break
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        checkup = self.get_object()
        if checkup.status != "completed":
            refresh_components_completed(checkup)
        return Response(AnnualCheckupSerializer(checkup).data)

    @extend_schema(tags=["HR"], summary="Refresh components")
    @action(detail=True, methods=["post"], url_path="refresh-components")
    def refresh_components(self, request, pk=None):
        checkup = self.get_object()
        refresh_components_completed(checkup)
        return Response(AnnualCheckupSerializer(checkup).data)

    @extend_schema(tags=["HR"], summary="Order investigations")
    @action(detail=True, methods=["post"], url_path="order-investigations")
    def order_investigations(self, request, pk=None):
        checkup = self.get_object()
        if checkup.status == "completed":
            return Response(
                {"detail": "Cannot order investigations on a completed check-up."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = AnnualCheckupOrderInvestigationsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = order_investigations_for_checkup(
            checkup,
            user=request.user,
            consultation_session_id=serializer.validated_data.get("consultation_session"),
            component_codes=serializer.validated_data.get("component_codes"),
            priority=serializer.validated_data.get("priority") or "routine",
        )
        checkup.refresh_from_db()
        return Response(
            {
                **result,
                "checkup": AnnualCheckupSerializer(checkup).data,
            }
        )

    @extend_schema(tags=["HR"], summary="Programme")
    @action(detail=False, methods=["get", "patch"], url_path="programme")
    def programme(self, request):
        from datetime import date

        year = int(request.query_params.get("programme_year") or date.today().year)
        if request.method == "GET":
            from permissions.user_capabilities import user_has_capability

            is_admin = request.user.is_superuser or user_has_capability(
                request.user, "annual_checkup_programme_catalog_admin"
            )
            catalog_source = get_full_catalog() if is_admin else get_active_catalog()
            catalog = [serialize_catalog_entry(d) for d in catalog_source]
            return Response(
                {
                    "programme_year": year,
                    "catalog": catalog,
                    "default_selected_codes": get_default_selected_codes(year),
                }
            )

        from permissions.user_capabilities import user_has_capability

        if not request.user.is_superuser and not user_has_capability(
            request.user, "annual_checkup_programme_edit"
        ):
            raise PermissionDenied("You do not have permission to edit programme settings.")

        catalog_creates = request.data.get("catalog_creates")
        catalog_updates = request.data.get("catalog_updates")
        cleaned = get_default_selected_codes(year)

        if catalog_creates is not None:
            if not isinstance(catalog_creates, list):
                return Response(
                    {"catalog_creates": "Expected a list of catalog objects."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                create_catalog_components(catalog_creates)
            except ValueError as exc:
                return Response({"catalog_creates": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            AuditService.log_activity(
                user=request.user,
                action="create",
                object_type="annual_checkup_catalog",
                object_id=str(year),
                module="patients",
                object_repr=f"Annual check-up catalog (+{len(catalog_creates)} items)",
                description="Created annual check-up catalog entries",
                request=request,
            )

        if catalog_updates is not None:
            if not isinstance(catalog_updates, list):
                return Response(
                    {"catalog_updates": "Expected a list of catalog objects."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                update_catalog_components(catalog_updates)
            except ValueError as exc:
                return Response({"catalog_updates": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            AuditService.log_activity(
                user=request.user,
                action="update",
                object_type="annual_checkup_catalog",
                object_id=str(year),
                module="patients",
                object_repr=f"Annual check-up catalog ({len(catalog_updates)} items)",
                description="Updated annual check-up catalog entries",
                request=request,
            )

        codes = request.data.get("default_selected_codes")
        if codes is not None:
            if not isinstance(codes, list):
                return Response(
                    {"default_selected_codes": "Expected a list of component codes."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            cleaned = validate_selected_component_codes(codes)
            settings_obj, _ = AnnualCheckupProgrammeSettings.objects.get_or_create(
                programme_year=year,
                defaults={"default_selected_codes": cleaned},
            )
            settings_obj.default_selected_codes = cleaned
            settings_obj.updated_by = request.user
            settings_obj.save()
            AuditService.log_activity(
                user=request.user,
                action="update",
                object_type="annual_checkup_programme",
                object_id=str(year),
                module="patients",
                object_repr=f"Annual check-up programme {year}",
                description=f"Updated default pre-ticked components ({len(cleaned)} items)",
                request=request,
            )
        elif catalog_updates is None and catalog_creates is None:
            return Response(
                {
                    "detail": (
                        "Provide default_selected_codes, catalog_updates, "
                        "and/or catalog_creates."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        catalog_source = get_full_catalog()
        catalog = [serialize_catalog_entry(d) for d in catalog_source]
        return Response(
            {
                "programme_year": year,
                "catalog": catalog,
                "default_selected_codes": cleaned,
            }
        )

    @extend_schema(tags=["HR"], summary="Ensure for visit", description="Create annual check-up record for an annual visit if missing.")
    @action(detail=False, methods=["post"], url_path="ensure-for-visit")
    def ensure_for_visit(self, request):
        """Create annual check-up record for an annual visit if missing."""
        visit_id = request.data.get("visit")
        if not visit_id:
            return Response({"visit": "Required."}, status=status.HTTP_400_BAD_REQUEST)
        visit = get_object_or_404(Visit, pk=visit_id)
        if visit.visit_type != "annual_checkup":
            return Response(
                {"detail": "Visit is not an annual check-up."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from rest_framework.exceptions import ValidationError as DRFValidationError

        try:
            checkup = create_annual_checkup_for_visit(visit)
        except DRFValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(AnnualCheckupSerializer(checkup).data)

    @extend_schema(tags=["HR"], summary="Sign off")
    @action(detail=True, methods=["post"], url_path="sign-off")
    def sign_off(self, request, pk=None):
        checkup = self.get_object()
        serializer = AnnualCheckupSignOffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        checkup = sign_off_annual_checkup(
            checkup,
            user=request.user,
            fitness_outcome=serializer.validated_data["fitness_outcome"],
            outcome_notes=serializer.validated_data.get("outcome_notes", ""),
            override_reason=serializer.validated_data.get("override_reason", ""),
            request=request,
        )
        return Response(AnnualCheckupSerializer(checkup).data)

    @extend_schema(tags=["HR"], summary="Report pdf")
    @action(detail=True, methods=["get"], url_path="report-pdf")
    def report_pdf(self, request, pk=None):
        checkup = self.get_object()
        force = (request.query_params.get("force") or "").lower() in ("1", "true", "yes")

        if checkup.status == "completed" and checkup.report_pdf and not force:
            try:
                with checkup.report_pdf.open("rb") as fh:
                    pdf_bytes = fh.read()
            except Exception:
                pdf_bytes = build_annual_checkup_report_pdf(checkup)
        else:
            pdf_bytes = build_annual_checkup_report_pdf(checkup)
            if checkup.status == "completed":
                fname = (
                    f"annual_checkup_{checkup.visit.visit_id}_"
                    f"{checkup.programme_year}.pdf"
                )
                if checkup.report_pdf:
                    checkup.report_pdf.delete(save=False)
                checkup.report_pdf.save(fname, ContentFile(pdf_bytes), save=False)
                checkup.save(update_fields=["report_pdf", "updated_at"])

        AuditService.log_activity(
            user=request.user,
            action="read",
            object_type="annual_checkup",
            object_id=str(checkup.id),
            module="patients",
            object_repr=f"Annual check-up {checkup.programme_year}",
            description="Downloaded annual check-up clinical report PDF",
            request=request,
        )

        filename = (
            f"annual_checkup_{checkup.visit.visit_id}_{checkup.programme_year}.pdf"
        )
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response
