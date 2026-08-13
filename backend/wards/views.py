"""
Views for the Wards app.
"""
import logging

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from django.http import HttpResponse
from django.utils import timezone

from common.date_display import format_display_datetime
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

logger = logging.getLogger(__name__)

from .models import (
    Ward,
    Bed,
    PatientAdmission,
    WardAssignment,
    AdmissionObservationVital,
    AdmissionTreatmentRow,
    AdmissionEscort,
)
from .serializers import (
    WardSerializer,
    BedSerializer,
    PatientAdmissionSerializer,
    WardAssignmentSerializer,
    AdmissionObservationVitalSerializer,
    AdmissionTreatmentRowSerializer,
    AdmissionEscortSerializer,
)
from common.mixins import FacilityScopedMixin
from common.openapi import document_viewset
from organization.models import SystemConfig
from audit.services import AuditService
from nursing.admission_orders import link_nursing_orders_to_admission
from permissions.ward_action_permissions import ensure_doctor_action, ensure_nurse_action
from .bed_ops import assign_admission_bed, clear_admission_bed, sync_bed_occupancy_after_admission_create

@document_viewset(tag="Wards", resource="wards")
class WardViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing wards."""

    facility_filter_field = 'location_clinic'
    serializer_class = WardSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['ward_type', 'status', 'floor', 'building', 'location_clinic']
    search_fields = ['name', 'ward_code', 'description']
    ordering_fields = ['name', 'ward_code', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Ward.objects.none()
        
        return self.scope_queryset(Ward.objects.all().prefetch_related('beds'))

    def perform_create(self, serializer):
        self.auto_set_facility(serializer)
        ward = serializer.save(created_by=self.request.user)

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='ward',
            object_id=str(ward.id),
            module='wards',
            object_repr=f'Ward {ward.ward_code}',
            description=f'Created ward {ward.name} ({ward.ward_code})',
            new_values={'ward_code': ward.ward_code, 'name': ward.name, 'ward_type': ward.ward_type},
            request=self.request,
        )

    @extend_schema(tags=["Wards"], summary="Beds", description="Get all beds in a ward.")
    @action(detail=True, methods=['get'])
    def beds(self, request, pk=None):
        """Get all beds in a ward."""
        ward = self.get_object()
        beds = ward.beds.all()
        serializer = BedSerializer(beds, many=True)
        return Response(serializer.data)

    @extend_schema(tags=["Wards"], summary="Occupancy", description="Get ward occupancy information.")
    @action(detail=True, methods=['get'])
    def occupancy(self, request, pk=None):
        """Get ward occupancy information."""
        ward = self.get_object()
        return Response({
            'ward_code': ward.ward_code,
            'name': ward.name,
            'total_beds': ward.total_beds,
            'occupied_beds': ward.occupied_beds,
            'available_beds': ward.available_beds,
            'occupancy_rate': ward.occupancy_rate,
            'status': ward.status,
        })


@document_viewset(tag="Wards", resource="beds")
class BedViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing beds."""

    facility_filter_field = 'ward__location_clinic'
    serializer_class = BedSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['ward', 'bed_type', 'status']
    search_fields = ['bed_number']
    ordering_fields = ['bed_number', 'created_at']
    ordering = ['bed_number']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Bed.objects.none()
        
        return self.scope_queryset(
            Bed.objects.all().select_related('ward', 'current_patient')
        )

    def perform_create(self, serializer):
        bed = serializer.save()

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='bed',
            object_id=str(bed.id),
            module='wards',
            object_repr=f'Bed {bed.bed_number}',
            description=f'Created bed {bed.bed_number} in ward {bed.ward.name}',
            new_values={'bed_number': bed.bed_number, 'ward': bed.ward.name, 'bed_type': bed.bed_type},
            request=self.request,
        )

    @extend_schema(tags=["Wards"], summary="Assign patient", description="Assign a patient to this bed.")
    @action(detail=True, methods=['post'])
    def assign_patient(self, request, pk=None):
        """Assign a patient to this bed."""
        bed = self.get_object()
        patient_id = request.data.get('patient_id')
        admission_date = request.data.get('admission_date')

        try:
            bed.assign_patient(patient_id, admission_date)

            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='bed',
                object_id=str(bed.id),
                module='wards',
                object_repr=f'Bed {bed.bed_number}',
                description=f'Assigned patient to bed {bed.bed_number}',
                old_values={'status': 'available'},
                new_values={'status': 'occupied', 'current_patient': patient_id},
                request=self.request,
            )

            return Response({'message': 'Patient assigned to bed successfully'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(tags=["Wards"], summary="Discharge patient", description="Discharge patient from this bed.")
    @action(detail=True, methods=['post'])
    def discharge_patient(self, request, pk=None):
        """Discharge patient from this bed."""
        bed = self.get_object()

        try:
            bed.discharge_patient()

            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='bed',
                object_id=str(bed.id),
                module='wards',
                object_repr=f'Bed {bed.bed_number}',
                description=f'Discharged patient from bed {bed.bed_number}',
                old_values={'status': 'occupied'},
                new_values={'status': 'available'},
                request=self.request,
            )

            return Response({'message': 'Patient discharged from bed successfully'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@document_viewset(tag="Wards", resource="patient admissions")
class PatientAdmissionViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing patient admissions."""

    facility_filter_field = 'visit__location_clinic'
    serializer_class = PatientAdmissionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'ward', 'bed', 'status', 'admission_type', 'admitting_doctor']
    search_fields = [
        'admission_id',
        'admission_diagnosis',
        'presenting_complaint',
        'patient__patient_id',
        'patient__personal_number',
        'patient__surname',
        'patient__first_name',
        'patient__middle_name',
    ]
    ordering_fields = ['admission_date', 'created_at']
    ordering = ['-admission_date']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return PatientAdmission.objects.none()
        
        qs = PatientAdmission.objects.all().select_related(
            'patient',
            'visit',
            'visit__location_clinic',
            'ward',
            'ward__location_clinic',
            'bed',
            'admitting_doctor',
            'discharge_doctor',
            'confirmed_by_nurse',
            'nursing_order',
            'transfer_to_ward',
            'escort__referral',
            'escort__facility',
            'escort__primary_nurse',
        )

        # Custom filters used by the "Recently discharged" view on the
        # ward pages. Accept ISO date or datetime strings; gracefully
        # ignore malformed values rather than 400-ing the whole list.
        discharged_after = self.request.query_params.get('discharged_after')
        if discharged_after:
            qs = qs.filter(discharge_date__gte=discharged_after)
        discharged_before = self.request.query_params.get('discharged_before')
        if discharged_before:
            qs = qs.filter(discharge_date__lte=discharged_before)

        # ``status_in`` — comma-separated list. Used by the nurse's "Active
        # patients" view to exclude ``discharged`` when the user picks
        # "All Status" (DRF's default ``status`` filter is single-value).
        status_in = self.request.query_params.get('status_in')
        if status_in:
            values = [v.strip() for v in status_in.split(',') if v.strip()]
            if values:
                qs = qs.filter(status__in=values)

        admission_date = self.request.query_params.get('admission_date')
        if admission_date:
            qs = qs.filter(admission_date__date=admission_date)
        admission_date_after = self.request.query_params.get('admission_date_after')
        if admission_date_after:
            qs = qs.filter(admission_date__date__gte=admission_date_after)
        admission_date_before = self.request.query_params.get('admission_date_before')
        if admission_date_before:
            qs = qs.filter(admission_date__date__lte=admission_date_before)

        if self.request.query_params.get('escalated') == '1':
            qs = qs.filter(
                Q(current_condition__icontains='needs doctor review')
                | Q(current_condition__icontains='escalat')
                | Q(current_condition__icontains='critical')
                | Q(current_condition__icontains='serious')
            )

        if self.request.query_params.get('unassigned_bed') == '1':
            qs = qs.filter(status='admitted', bed__isnull=True)

        return self.scope_queryset(qs)

    @extend_schema(tags=["Wards"], summary="List stats", description="Admission KPI counts (replaces parallel COUNT requests).")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Admission KPI counts (replaces parallel COUNT requests)."""
        from common.list_stats import viewset_queryset_excluding_params

        qs = viewset_queryset_excluding_params(
            self,
            frozenset({
                'status',
                'status_in',
                'page',
                'page_size',
                'ordering',
                'escalated',
                'unassigned_bed',
            }),
        )
        admitted_qs = qs.filter(status='admitted')
        escalated_q = (
            Q(current_condition__icontains='needs doctor review')
            | Q(current_condition__icontains='escalat')
            | Q(current_condition__icontains='critical')
            | Q(current_condition__icontains='serious')
        )
        return Response({
            'total': qs.count(),
            'admitted': admitted_qs.count(),
            'pending_discharge': qs.filter(status='pending_discharge').count(),
            'escalated': admitted_qs.filter(escalated_q).count(),
            'unassigned_bed': admitted_qs.filter(bed__isnull=True).count(),
        })

    def perform_update(self, serializer):
        previous_condition = (self.get_object().current_condition or '').lower()
        admission = serializer.save()
        current_condition = (admission.current_condition or '').lower()
        was_escalated = 'needs doctor review' in previous_condition or 'escalat' in previous_condition
        is_escalated = 'needs doctor review' in current_condition or 'escalat' in current_condition

        if is_escalated and not was_escalated and admission.admitting_doctor_id:
            try:
                from notifications.services import NotificationService

                NotificationService.create_notification(
                    user=admission.admitting_doctor,
                    title='Urgent ward review requested',
                    message=(
                        f'{admission.patient.get_full_name()} needs doctor review in '
                        f'{admission.ward.name} ({admission.admission_id}).'
                    ),
                    notification_type='alert',
                    priority='urgent',
                    action_url=f'/wards/admissions/{admission.id}',
                    object_type='ward_admission',
                    object_id=str(admission.id),
                    metadata={'reason': 'nurse_escalation', 'admission_id': admission.id},
                )
            except Exception:
                # Escalation persistence must not fail because notifications are unavailable.
                pass

    def perform_create(self, serializer):
        ensure_doctor_action(self.request.user)
        # Default admitting_doctor to the authenticated user when the client
        # didn't supply a valid one. This mirrors the discharge_doctor flow
        # and prevents "Invalid pk ... object does not exist" errors when the
        # client sends a stale/placeholder id (e.g. the logged-in user's
        # cached display id that no longer matches a DB row).
        if not serializer.validated_data.get('admitting_doctor'):
            serializer.validated_data['admitting_doctor'] = self.request.user

        with transaction.atomic():
            ward = Ward.objects.select_for_update().get(pk=serializer.validated_data['ward'].pk)
            if ward.status != 'active':
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'ward': 'Selected ward is not active.'})
            if not ward.is_bed_available():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'ward': 'Selected ward has no available beds.'})
            serializer.validated_data['ward'] = ward
            admission = serializer.save(created_by=self.request.user)

            link_nursing_orders_to_admission(admission)
            sync_bed_occupancy_after_admission_create(admission)

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='admission',
            object_id=str(admission.id),
            module='wards',
            object_repr=f'Admission {admission.admission_id}',
            description=f'Admitted patient {admission.patient.get_full_name()} to ward {admission.ward.name}',
            new_values={
                'admission_id': admission.admission_id,
                'patient': admission.patient.get_full_name(),
                'ward': admission.ward.name
            },
            request=self.request,
        )

    @extend_schema(tags=["Wards"], summary="Initiate discharge", description="Step 1 of 2-step discharge: doctor fills discharge details and sets")
    @action(detail=True, methods=['post'])
    def initiate_discharge(self, request, pk=None):
        """
        Step 1 of 2-step discharge: doctor fills discharge details and sets
        status to pending_discharge. Nurse will confirm in Step 2.

        Optionally creates a ``consultation.Referral`` (and a stub
        ``AdmissionEscort``) when the doctor flags this discharge as a
        transfer to an external facility.
        """
        ensure_doctor_action(request.user)
        admission = self.get_object()

        if admission.status != 'admitted':
            return Response(
                {'error': 'Only admitted patients can have discharge initiated'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        discharge_type = request.data.get('discharge_type', 'regular')
        discharge_diagnosis = request.data.get('discharge_diagnosis', '')
        discharge_notes = request.data.get('discharge_notes', '')
        discharge_summary = request.data.get('discharge_summary', '')
        follow_up_instructions = request.data.get('follow_up_instructions', '')

        if not discharge_diagnosis:
            return Response(
                {'error': 'Discharge diagnosis is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optional referral block — present when doctor enables "Refer for
        # continued care at an external facility". We accept either a
        # `facility_partner` id (catalog row) or a free-typed `facility`.
        referral_payload = request.data.get('referral') or {}
        wants_referral = bool(referral_payload) and (
            referral_payload.get('facility_partner') or (referral_payload.get('facility') or '').strip()
        )

        if wants_referral:
            specialty = (referral_payload.get('specialty') or '').strip()
            reason = (referral_payload.get('reason') or '').strip()
            if not specialty:
                return Response(
                    {'error': 'Referral specialty is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not reason:
                return Response(
                    {'error': 'Referral reason is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        admission.status = 'pending_discharge'
        admission.discharge_type = discharge_type
        admission.discharge_diagnosis = discharge_diagnosis
        admission.discharge_notes = discharge_notes
        admission.discharge_summary = discharge_summary
        admission.follow_up_instructions = follow_up_instructions
        admission.discharge_doctor = request.user
        admission.save(update_fields=[
            'status', 'discharge_type', 'discharge_diagnosis',
            'discharge_notes', 'discharge_summary', 'follow_up_instructions',
            'discharge_doctor',
        ])

        # Create the linked referral + stub escort row so nursing has a
        # queue entry the moment the doctor saves.
        referral_obj = None
        if wants_referral:
            from consultation.models import Referral, ReferralFacility

            partner_id = referral_payload.get('facility_partner')
            partner = None
            facility_name = (referral_payload.get('facility') or '').strip()
            if partner_id:
                try:
                    partner = ReferralFacility.objects.get(pk=int(partner_id))
                except (ReferralFacility.DoesNotExist, TypeError, ValueError):
                    partner = None
            if partner and not facility_name:
                facility_name = partner.name

            referral_obj = Referral.objects.create(
                patient=admission.patient,
                visit=admission.visit,
                referred_by=request.user,
                created_by=request.user,
                specialty=(referral_payload.get('specialty') or '').strip(),
                facility_partner=partner,
                facility=facility_name,
                facility_type=(referral_payload.get('facility_type') or 'external'),
                reason=(referral_payload.get('reason') or '').strip(),
                clinical_summary=(referral_payload.get('clinical_summary') or admission.discharge_summary or ''),
                urgency=(referral_payload.get('urgency') or 'routine'),
                contact_person=(referral_payload.get('contact_person') or ''),
                contact_phone=(referral_payload.get('contact_phone') or ''),
                contact_email=(referral_payload.get('contact_email') or ''),
                notes=(referral_payload.get('notes') or ''),
                status='draft',
            )

            # Stub escort row — nurse fills in the rest at sign-out.
            escort, _ = AdmissionEscort.objects.get_or_create(
                admission=admission,
                defaults={
                    'referral': referral_obj,
                    'facility': partner,
                    'facility_name_snapshot': facility_name,
                    'created_by': request.user,
                },
            )
            if escort.referral_id != referral_obj.id:
                escort.referral = referral_obj
                escort.facility = partner
                escort.facility_name_snapshot = facility_name
                escort.save(update_fields=['referral', 'facility', 'facility_name_snapshot'])

        AuditService.log_activity(
            user=request.user,
            action='update',
            object_type='admission',
            object_id=str(admission.id),
            module='wards',
            object_repr=f'Admission {admission.admission_id}',
            description=(
                f'Discharge initiated for {admission.patient.get_full_name()} — '
                'awaiting nurse confirmation'
                + (f' (external referral: {referral_obj.referral_id})' if referral_obj else '')
            ),
            old_values={'status': 'admitted'},
            new_values={
                'status': 'pending_discharge',
                **({'referral': referral_obj.referral_id} if referral_obj else {}),
            },
            request=request,
        )

        serializer = self.get_serializer(admission)
        return Response(serializer.data)

    @extend_schema(tags=["Wards"], summary="Cancel referral", description="Cancel the external-care referral that was attached during")
    @action(detail=True, methods=['post'])
    def cancel_referral(self, request, pk=None):
        """
        Cancel the external-care referral that was attached during
        ``initiate_discharge``.

        Allowed only while the admission is still ``pending_discharge`` and
        the escort hasn't been arrival-confirmed. Once the nurse has signed
        the patient out (status → ``discharged``) the patient has physically
        left and the referral is a real, in-flight event — at that point
        any changes belong in the consultation referrals module and must
        carry the appropriate audit trail.

        Effects:
            * Referral status set to ``cancelled``, ``closed_at`` stamped.
            * Optional cancellation reason appended to referral notes.
            * The stub :class:`AdmissionEscort` row is deleted (it was
              created speculatively; nothing nurse-side depends on it yet).
        """
        ensure_doctor_action(request.user)
        admission = self.get_object()

        if admission.status != 'pending_discharge':
            return Response(
                {'error': 'Referral can only be cancelled while discharge is pending nurse confirmation.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        escort = getattr(admission, 'escort', None)
        if not escort or not escort.referral_id:
            return Response(
                {'error': 'No referral is linked to this admission.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if escort.arrival_confirmed_at:
            return Response(
                {'error': 'Cannot cancel — arrival has already been confirmed at the receiving facility.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        referral = escort.referral
        reason = (request.data.get('reason') or '').strip()

        # Mark the referral as cancelled.
        referral.status = 'cancelled'
        referral.closed_at = timezone.now()
        if reason:
            stamp = format_display_datetime()
            user_label = request.user.get_full_name() or request.user.username
            referral.notes = (
                (referral.notes or '').rstrip()
                + f'\n\n[Cancelled {stamp} by {user_label}] {reason}'
            ).strip()
        referral.save(update_fields=['status', 'closed_at', 'notes'])

        # Drop the stub escort row — it carries no nurse-supplied state yet.
        escort_id = escort.id
        referral_display = referral.referral_id
        escort.delete()

        AuditService.log_activity(
            user=request.user,
            action='delete',
            object_type='admission_escort',
            object_id=str(escort_id),
            module='wards',
            object_repr=f'Admission {admission.admission_id}',
            description=(
                f'Cancelled external referral {referral_display} for '
                f'{admission.patient.get_full_name()}'
                + (f' — reason: {reason}' if reason else '')
            ),
            new_values={'referral_status': 'cancelled', 'reason': reason},
            request=request,
        )

        # Refresh and return the admission so the UI can drop the panel.
        admission.refresh_from_db()
        serializer = self.get_serializer(admission)
        return Response(serializer.data)

    @extend_schema(tags=["Wards"], summary="Update referral", description="Update fields on the external-care referral attached during")
    @action(detail=True, methods=['post'])
    def update_referral(self, request, pk=None):
        """
        Update fields on the external-care referral attached during
        ``initiate_discharge`` (facility, specialty, reason, urgency,
        contact info, notes, clinical summary).

        Same guard as ``cancel_referral`` — only allowed while
        ``pending_discharge`` and arrival is not yet confirmed. The escort
        row's facility snapshot is kept in sync so the nurse's queue
        always shows the current destination.
        """
        ensure_doctor_action(request.user)
        admission = self.get_object()

        if admission.status != 'pending_discharge':
            return Response(
                {'error': 'Referral can only be edited while discharge is pending nurse confirmation.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        escort = getattr(admission, 'escort', None)
        if not escort or not escort.referral_id:
            return Response(
                {'error': 'No referral is linked to this admission.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if escort.arrival_confirmed_at:
            return Response(
                {'error': 'Cannot edit — arrival has already been confirmed at the receiving facility.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from consultation.models import Referral, ReferralFacility  # noqa: F401

        referral = escort.referral
        data = request.data

        # Validate the same minimums initiate_discharge enforces — a
        # facility must always be set (partner OR free-typed name) and the
        # specialty + reason must be present.
        partner_id = data.get('facility_partner')
        partner = referral.facility_partner
        facility_name = (data.get('facility') or '').strip() or referral.facility

        if 'facility_partner' in data:
            if partner_id:
                try:
                    partner = ReferralFacility.objects.get(pk=int(partner_id))
                except (ReferralFacility.DoesNotExist, TypeError, ValueError):
                    return Response(
                        {'error': 'Selected facility partner does not exist.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if not (data.get('facility') or '').strip():
                    facility_name = partner.name
            else:
                partner = None

        if not facility_name and not partner:
            return Response(
                {'error': 'A receiving facility (partner or name) is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_values = {
            'facility': referral.facility,
            'facility_partner_id': referral.facility_partner_id,
            'specialty': referral.specialty,
            'reason': referral.reason,
            'urgency': referral.urgency,
        }

        update_fields = set()

        if 'specialty' in data:
            new_specialty = (data.get('specialty') or '').strip()
            if not new_specialty:
                return Response(
                    {'error': 'Specialty is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            referral.specialty = new_specialty
            update_fields.add('specialty')
        if 'reason' in data:
            new_reason = (data.get('reason') or '').strip()
            if not new_reason:
                return Response(
                    {'error': 'Reason is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            referral.reason = new_reason
            update_fields.add('reason')
        if 'urgency' in data and data.get('urgency'):
            referral.urgency = data['urgency']
            update_fields.add('urgency')
        if 'facility_type' in data and data.get('facility_type'):
            referral.facility_type = data['facility_type']
            update_fields.add('facility_type')
        if 'clinical_summary' in data:
            referral.clinical_summary = data.get('clinical_summary') or ''
            update_fields.add('clinical_summary')
        for fld in ('contact_person', 'contact_phone', 'contact_email', 'notes'):
            if fld in data:
                setattr(referral, fld, data.get(fld) or '')
                update_fields.add(fld)

        # Facility update goes last so we always end with consistent values.
        if 'facility_partner' in data or 'facility' in data:
            referral.facility_partner = partner
            referral.facility = facility_name
            update_fields.update({'facility_partner', 'facility'})
            # Refresh the address snapshot when partner changes.
            if partner is not None:
                referral.facility_address_snapshot = getattr(partner, 'address', '') or ''
                update_fields.add('facility_address_snapshot')

        if update_fields:
            referral.save(update_fields=list(update_fields))

        # Sync the escort row's denormalised facility info.
        escort_changed = False
        if escort.facility_id != (partner.id if partner else None):
            escort.facility = partner
            escort_changed = True
        if escort.facility_name_snapshot != facility_name:
            escort.facility_name_snapshot = facility_name
            escort_changed = True
        if escort_changed:
            escort.save(update_fields=['facility', 'facility_name_snapshot'])

        AuditService.log_activity(
            user=request.user,
            action='update',
            object_type='admission_escort',
            object_id=str(escort.id),
            module='wards',
            object_repr=f'Admission {admission.admission_id}',
            description=(
                f'Updated external referral {referral.referral_id} for '
                f'{admission.patient.get_full_name()}'
            ),
            old_values=old_values,
            new_values={
                'facility': referral.facility,
                'facility_partner_id': referral.facility_partner_id,
                'specialty': referral.specialty,
                'reason': referral.reason,
                'urgency': referral.urgency,
            },
            request=request,
        )

        admission.refresh_from_db()
        serializer = self.get_serializer(admission)
        return Response(serializer.data)

    @extend_schema(tags=["Wards"], summary="Discharge", description="Step 2 of 2-step discharge (nurse confirms) OR direct one-step discharge.")
    @action(detail=True, methods=['post'])
    def discharge(self, request, pk=None):
        """
        Step 2 of 2-step discharge (nurse confirms) OR direct one-step discharge.

        The nurse's confirmation captures an exit summary, who the patient is
        leaving with, optional escort details (when a referral is attached),
        and the actual departure timestamp. Doctor-set fields are preserved
        unless the request explicitly overrides them.
        """
        admission = self.get_object()
        data = request.data
        if admission.status == 'pending_discharge':
            ensure_nurse_action(request.user)
        else:
            ensure_doctor_action(request.user)

        # Step 2 (nurse) requires the exit summary so we always have a
        # nursing record of the patient's condition at handoff.
        is_step_two = admission.status == 'pending_discharge'
        nurse_exit_summary = (data.get('nurse_exit_summary') or '').strip()
        if is_step_two and not nurse_exit_summary:
            return Response(
                {'error': 'Nurse exit summary is required to confirm discharge'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Build kwargs only from values actually sent in the request
            kwargs = {}
            if data.get('discharge_type'):
                kwargs['discharge_type'] = data['discharge_type']
            if data.get('discharge_diagnosis'):
                kwargs['discharge_diagnosis'] = data['discharge_diagnosis']
            if data.get('discharge_notes'):
                kwargs['discharge_notes'] = data['discharge_notes']
            if data.get('discharge_summary'):
                kwargs['discharge_summary'] = data['discharge_summary']
            if data.get('follow_up_instructions'):
                kwargs['follow_up_instructions'] = data['follow_up_instructions']

            # Nurse exit / sign-out fields. We pass these through
            # ``discharge_patient`` which only sets non-None values.
            if nurse_exit_summary:
                kwargs['nurse_exit_summary'] = nurse_exit_summary
            for fld in ('discharged_with', 'companion_name', 'companion_relationship', 'companion_phone'):
                if data.get(fld) is not None:
                    kwargs[fld] = data[fld]
            kwargs['physically_left_at'] = timezone.now()
            kwargs['confirmed_by_nurse'] = request.user

            admission.discharge_patient(
                discharge_doctor=admission.discharge_doctor or None,
                **kwargs,
            )

            # Update / fill the escort row (if any) with what the nurse
            # captured at sign-out. Stub may have been pre-created during
            # initiate_discharge; otherwise create one if escort details
            # were submitted.
            escort_payload = data.get('escort') or {}
            existing_escort = AdmissionEscort.objects.filter(admission=admission).first()
            if escort_payload or existing_escort:
                escort = existing_escort or AdmissionEscort.objects.create(
                    admission=admission,
                    created_by=request.user,
                )
                if escort_payload.get('primary_nurse'):
                    escort.primary_nurse_id = escort_payload['primary_nurse']
                if escort_payload.get('transport_mode'):
                    escort.transport_mode = escort_payload['transport_mode']
                if escort_payload.get('handover_summary') is not None:
                    escort.handover_summary = escort_payload['handover_summary']
                # Departure defaults to "now" once the patient physically leaves.
                escort.departure_at = escort.departure_at or timezone.now()
                escort.save()
                additional = escort_payload.get('additional_nurses') or []
                if isinstance(additional, list):
                    valid_ids = [int(x) for x in additional if str(x).isdigit()]
                    escort.additional_nurses.set(valid_ids)

            AuditService.log_activity(
                user=request.user,
                action='update',
                object_type='admission',
                object_id=str(admission.id),
                module='wards',
                object_repr=f'Admission {admission.admission_id}',
                description=f'Discharged patient {admission.patient.get_full_name()} from ward {admission.ward.name}',
                old_values={'status': admission.status},
                new_values={'status': 'discharged'},
                request=request,
            )

            # We deliberately DO NOT snapshot eagerly here. Late lab /
            # radiology results and the nurse's escort arrival callback
            # legitimately land after the discharge transaction commits, and
            # they belong in the final audit copy. ``summary_pdf`` renders
            # live for the first 7 days and locks the snapshot afterwards.

            serializer = self.get_serializer(admission)
            return Response(serializer.data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Days after discharge during which the summary PDF is still rendered
    # live — accommodates late lab/radiology results and escort arrival
    # callbacks that legitimately arrive after discharge. After this
    # window the cached snapshot locks as the audit copy.
    SUMMARY_PDF_LIVE_GRACE_DAYS = 7

    @extend_schema(tags=["Wards"], summary="Summary pdf", description="Return the Ward Admission Summary PDF for this admission.")
    @action(detail=True, methods=['get'])
    def summary_pdf(self, request, pk=None):
        """
        Return the Ward Admission Summary PDF for this admission.

        Lifecycle:
            * **Admitted / pending_discharge** — render live. The PDF body
              is clearly marked INTERIM.
            * **Discharged, < 7 days ago** — render live and update the
              cached snapshot opportunistically; late labs / radiology
              reports / escort arrival confirmations land in the audit
              copy.
            * **Discharged, ≥ 7 days ago** — serve the cached snapshot.
              The audit copy is locked. If somehow the cache is missing,
              render once and persist.

        Pass ``?force=true`` to always render fresh (debug aid).
        """
        from .pdfs import build_admission_summary_pdf

        admission = self.get_object()
        force = (request.query_params.get('force') or '').lower() in ('1', 'true', 'yes')

        is_discharged = admission.status == 'discharged'
        days_since_discharge = None
        if is_discharged and admission.discharge_date:
            delta = timezone.now() - admission.discharge_date
            days_since_discharge = delta.days

        snapshot_locked = (
            is_discharged
            and admission.summary_pdf_file
            and days_since_discharge is not None
            and days_since_discharge >= self.SUMMARY_PDF_LIVE_GRACE_DAYS
        )

        if not force and snapshot_locked:
            try:
                with admission.summary_pdf_file.open('rb') as fh:
                    pdf_bytes = fh.read()
            except Exception:
                logger.exception(
                    'Locked snapshot PDF read failed for admission %s — '
                    'rendering live as fallback',
                    admission.admission_id,
                )
                pdf_bytes = build_admission_summary_pdf(admission)
        else:
            pdf_bytes = build_admission_summary_pdf(admission)
            # During the live-grace window keep the cache fresh so a
            # power outage between events never leaves us without an
            # audit copy. Once the window closes, the next download
            # serves this stored copy verbatim.
            if not force and is_discharged:
                try:
                    fname = f"admission_summary_{admission.admission_id}.pdf"
                    # Replace any prior cached file so we don't accumulate.
                    if admission.summary_pdf_file:
                        admission.summary_pdf_file.delete(save=False)
                    admission.summary_pdf_file.save(
                        fname, ContentFile(pdf_bytes), save=False,
                    )
                    admission.summary_pdf_generated_at = timezone.now()
                    admission.save(update_fields=[
                        'summary_pdf_file', 'summary_pdf_generated_at',
                    ])
                except Exception:
                    logger.exception(
                        'Snapshot persist failed for admission %s',
                        admission.admission_id,
                    )

        AuditService.log_activity(
            user=request.user,
            action='read',
            object_type='admission',
            object_id=str(admission.id),
            module='wards',
            object_repr=f'Admission {admission.admission_id}',
            description=(
                f'Downloaded admission summary PDF for '
                f'{admission.patient.get_full_name()} '
                f'({"snapshot" if snapshot_locked else "live"})'
            ),
            request=request,
        )

        filename = f"admission_summary_{admission.admission_id}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @extend_schema(tags=["Wards"], summary="Discharge slip pdf", description="Return the patient-facing one-page Discharge Slip PDF.")
    @action(detail=True, methods=['get'])
    def discharge_slip_pdf(self, request, pk=None):
        """
        Return the patient-facing one-page Discharge Slip PDF.

        Only available once the admission has been discharged — before
        that, take-home medicines and follow-up plans aren't finalised.
        """
        from .pdfs import build_patient_discharge_slip_pdf

        admission = self.get_object()
        if admission.status not in ('discharged', 'pending_discharge'):
            return Response(
                {'error': 'The discharge slip is available once the patient has been discharged.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pdf_bytes = build_patient_discharge_slip_pdf(admission)

        AuditService.log_activity(
            user=request.user,
            action='read',
            object_type='admission',
            object_id=str(admission.id),
            module='wards',
            object_repr=f'Admission {admission.admission_id}',
            description=f'Downloaded patient discharge slip for {admission.patient.get_full_name()}',
            request=request,
        )

        filename = f"discharge_slip_{admission.admission_id}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @extend_schema(tags=["Wards"], summary="Referral letter pdf", description="Return a formal Referral Letter PDF for the receiving facility.")
    @action(detail=True, methods=['get'])
    def referral_letter_pdf(self, request, pk=None):
        """
        Return a formal Referral Letter PDF for the receiving facility.

        Only available when the admission has a linked external referral
        (i.e. an :class:`AdmissionEscort` row with a ``referral`` attached).
        This is rendered live every time — there is no audit snapshot,
        because the source-of-truth (the ``Referral`` row) is itself the
        record and can be edited until the escort is confirmed.
        """
        from .pdfs import build_referral_letter_pdf

        admission = self.get_object()
        escort = getattr(admission, 'escort', None)
        referral = getattr(escort, 'referral', None) if escort else None
        if not referral:
            return Response(
                {'error': 'No external referral is linked to this admission.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pdf_bytes = build_referral_letter_pdf(admission)

        AuditService.log_activity(
            user=request.user,
            action='read',
            object_type='admission',
            object_id=str(admission.id),
            module='wards',
            object_repr=f'Admission {admission.admission_id}',
            description=(
                f'Downloaded referral letter for {admission.patient.get_full_name()} '
                f'(referral {referral.referral_id})'
            ),
            request=request,
        )

        filename = f"referral_letter_{admission.admission_id}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @extend_schema(tags=["Wards"], summary="Responsibility form pdf", description="Return a Patient / Guardian Responsibility Form PDF.")
    @action(detail=True, methods=['get'])
    def responsibility_form_pdf(self, request, pk=None):
        """
        Return a Patient / Guardian Responsibility Form PDF.

        Query params:
            * ``form_type`` — one of ``transfer``, ``dama``, ``general``,
              ``auto`` (default). ``auto`` selects the template from
              admission state: transfer for transfer/escort discharges,
              DAMA when ``discharge_type == 'against_medical_advice'``,
              else a generic discharge acknowledgment.

        Always renders live — these forms are pre-signature handouts and
        each printing is a new physical document.
        """
        from .pdfs import build_responsibility_form_pdf, RESPONSIBILITY_FORM_TYPES

        admission = self.get_object()
        form_type = (request.query_params.get('form_type') or 'auto').strip().lower()
        if form_type not in RESPONSIBILITY_FORM_TYPES:
            return Response(
                {
                    'error': (
                        f'Invalid form_type "{form_type}". '
                        f'Allowed: {", ".join(RESPONSIBILITY_FORM_TYPES)}.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        pdf_bytes = build_responsibility_form_pdf(admission, form_type=form_type)

        AuditService.log_activity(
            user=request.user,
            action='read',
            object_type='admission',
            object_id=str(admission.id),
            module='wards',
            object_repr=f'Admission {admission.admission_id}',
            description=(
                f'Downloaded {form_type} responsibility form for '
                f'{admission.patient.get_full_name()}'
            ),
            request=request,
        )

        filename = f"responsibility_form_{form_type}_{admission.admission_id}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @extend_schema(tags=["Wards"], summary="Assign bed", description="Assign or change a bed for an admitted patient.")
    @action(detail=True, methods=['post'])
    def assign_bed(self, request, pk=None):
        """Assign or change a bed for an admitted patient."""
        ensure_nurse_action(request.user)
        admission = self.get_object()
        bed_id = request.data.get('bed_id')

        try:
            if bed_id is None:
                clear_admission_bed(admission)
                admission.bed = None
                admission.save(update_fields=['bed'])
                serializer = self.get_serializer(admission)
                return Response(serializer.data)

            new_bed = Bed.objects.select_related('ward').get(id=bed_id)
            assign_admission_bed(admission, new_bed)

            AuditService.log_activity(
                user=request.user,
                action='update',
                object_type='admission',
                object_id=str(admission.id),
                module='wards',
                object_repr=f'Admission {admission.admission_id}',
                description=f'Assigned bed {new_bed.bed_number} to {admission.patient.get_full_name()}',
                new_values={'bed': new_bed.bed_number},
                request=request,
            )

            serializer = self.get_serializer(admission)
            return Response(serializer.data)

        except Bed.DoesNotExist:
            return Response({'error': 'Bed not found'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(tags=["Wards"], summary="Transfer", description="Transfer patient to another ward.")
    @action(detail=True, methods=['post'])
    def transfer(self, request, pk=None):
        """Transfer patient to another ward (active stay continues in destination ward)."""
        ensure_doctor_action(request.user)
        admission = self.get_object()
        transfer_data = request.data

        try:
            if admission.status != 'admitted':
                return Response(
                    {'error': 'Only actively admitted patients can be transferred between wards'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            new_ward_id = transfer_data.get('new_ward_id')
            transfer_reason = transfer_data.get('transfer_reason', '')

            if not new_ward_id:
                return Response({'error': 'New ward ID is required'}, status=status.HTTP_400_BAD_REQUEST)

            new_ward = Ward.objects.get(id=new_ward_id)

            if new_ward.id == admission.ward_id:
                return Response(
                    {'error': 'Patient is already in this ward'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            old_ward = admission.ward
            clear_admission_bed(admission)

            admission.ward = new_ward
            admission.bed = None
            admission.transfer_to_ward = new_ward
            admission.transfer_reason = transfer_reason
            admission.status = 'admitted'
            admission.save(update_fields=[
                'ward', 'bed', 'transfer_to_ward', 'transfer_reason', 'status',
            ])

            old_ward.recalculate_occupancy()
            new_ward.recalculate_occupancy()

            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='admission',
                object_id=str(admission.id),
                module='wards',
                object_repr=f'Admission {admission.admission_id}',
                description=(
                    f'Transferred patient {admission.patient.get_full_name()} '
                    f'from {old_ward.name} to {new_ward.name}'
                ),
                old_values={'ward': old_ward.name, 'status': 'admitted'},
                new_values={'ward': new_ward.name, 'transfer_to_ward': new_ward.name},
                request=self.request,
            )

            serializer = self.get_serializer(admission)
            return Response(serializer.data)
        except Ward.DoesNotExist:
            return Response({'error': 'New ward not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@document_viewset(tag="Wards", resource="ward assignments")
class WardAssignmentViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing ward assignments."""

    facility_filter_field = 'admission__visit__location_clinic'
    serializer_class = WardAssignmentSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['admission', 'nurse', 'assignment_type', 'status']
    search_fields = ['responsibilities', 'shift_notes']
    ordering_fields = ['assigned_at', 'completed_at']
    ordering = ['-assigned_at']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return WardAssignment.objects.none()
        
        return self.scope_queryset(
            WardAssignment.objects.all().select_related('admission__patient', 'admission__ward', 'nurse', 'assigned_by')
        )

    def perform_create(self, serializer):
        ensure_nurse_action(self.request.user)
        assignment = serializer.save(assigned_by=self.request.user)

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='ward_assignment',
            object_id=str(assignment.id),
            module='wards',
            object_repr=f'Assignment {assignment.assignment_type}',
            description=f'Assigned nurse {assignment.nurse.get_full_name()} to patient {assignment.admission.patient.get_full_name()}',
            new_values={
                'nurse': assignment.nurse.get_full_name(),
                'patient': assignment.admission.patient.get_full_name(),
                'assignment_type': assignment.assignment_type
            },
            request=self.request,
        )

    @extend_schema(tags=["Wards"], summary="Complete", description="Mark assignment as completed.")
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark assignment as completed."""
        ensure_nurse_action(request.user)
        assignment = self.get_object()
        notes = request.data.get('notes', '')

        try:
            assignment.complete_assignment(notes)

            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='ward_assignment',
                object_id=str(assignment.id),
                module='wards',
                object_repr=f'Assignment {assignment.assignment_type}',
                description=f'Completed ward assignment for nurse {assignment.nurse.get_full_name()}',
                old_values={'status': 'active'},
                new_values={'status': 'completed'},
                request=self.request,
            )

            return Response({'message': 'Assignment completed successfully'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def active_for_admissions(self, request):
        """
        Return all active nurse assignments for the given admission IDs.

        GET .../assignments/active-for-admissions/?admission_ids=1,2,3

        Unpaginated — intended for Ward Care when loading assignments for the
        admissions visible on the current list page (bounded batch).
        """
        raw = (request.query_params.get('admission_ids') or '').strip()
        if not raw:
            return Response({'results': [], 'count': 0})

        ids = []
        for part in raw.split(','):
            part = part.strip()
            if part.isdigit():
                ids.append(int(part))

        if not ids:
            return Response({'results': [], 'count': 0})

        max_ids = 500
        if len(ids) > max_ids:
            return Response(
                {'detail': f'At most {max_ids} admission_ids allowed per request.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = (
            self.get_queryset()
            .filter(status='active', admission_id__in=ids)
            .order_by('admission_id', '-assigned_at')
        )
        serializer = self.get_serializer(qs, many=True)
        data = serializer.data
        return Response({'results': data, 'count': len(data)})


@document_viewset(tag="Wards", resource="admission observation vitals")
class AdmissionObservationVitalViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """Continuous observation vitals for a ward admission (filter: ?admission=)."""

    facility_filter_field = 'admission__visit__location_clinic'
    serializer_class = AdmissionObservationVitalSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["admission"]
    ordering = ["-recorded_at"]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return AdmissionObservationVital.objects.none()
        
        return self.scope_queryset(
            AdmissionObservationVital.objects.select_related("admission", "recorded_by")
        )

    def perform_create(self, serializer):
        ensure_nurse_action(self.request.user)
        instance = serializer.save(recorded_by=self.request.user)
        try:
            from .observation_vitals_sync import sync_observation_vital_to_patient_vitals

            sync_observation_vital_to_patient_vitals(instance)
        except Exception:
            logger.exception(
                'Failed to mirror observation vital %s to patient vitals',
                instance.pk,
            )


@document_viewset(tag="Wards", resource="admission escorts")
class AdmissionEscortViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """Escort assignments for ward admissions.

    Listing supports the nurse "patients leaving with us" queue via
    ``?status=pending`` (no arrival_confirmed_at) and ``?status=confirmed``
    (arrival_confirmed_at is set). Custom action ``confirm_arrival``
    captures the call-back from the receiving facility.
    """

    facility_filter_field = 'admission__visit__location_clinic'
    serializer_class = AdmissionEscortSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['admission', 'facility', 'referral']
    ordering_fields = ['created_at', 'departure_at', 'arrival_confirmed_at']
    ordering = ['-created_at']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return AdmissionEscort.objects.none()
        
        qs = AdmissionEscort.objects.select_related(
            'admission__patient',
            'admission__ward',
            'referral',
            'facility',
            'primary_nurse',
            'arrival_confirmed_by',
        ).prefetch_related('additional_nurses')

        status_filter = self.request.query_params.get('status')
        if status_filter == 'pending':
            qs = qs.filter(arrival_confirmed_at__isnull=True)
        elif status_filter == 'confirmed':
            qs = qs.filter(arrival_confirmed_at__isnull=False)
        return self.scope_queryset(qs)

    def perform_create(self, serializer):
        ensure_nurse_action(self.request.user)
        serializer.save(created_by=self.request.user)

    @extend_schema(tags=["Wards"], summary="Confirm arrival", description="Nurse calls/visits the receiving facility and records handover.")
    @action(detail=True, methods=['post'])
    def confirm_arrival(self, request, pk=None):
        """Nurse calls/visits the receiving facility and records handover."""
        ensure_nurse_action(request.user)
        escort = self.get_object()
        if escort.arrival_confirmed_at:
            return Response(
                {'error': 'Arrival already confirmed for this escort'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        escort.arrival_confirmed_at = timezone.now()
        escort.arrival_confirmed_by = request.user
        notes = request.data.get('arrival_notes')
        if notes is not None:
            escort.arrival_notes = notes
        outcome = request.data.get('arrival_call_outcome')
        if outcome:
            escort.arrival_call_outcome = outcome
        escort.save(update_fields=[
            'arrival_confirmed_at',
            'arrival_confirmed_by',
            'arrival_notes',
            'arrival_call_outcome',
            'updated_at',
        ])

        # Mirror onto the linked referral so external-care queues elsewhere
        # show "stamped" / acknowledged at the same time.
        if escort.referral_id:
            referral = escort.referral
            if not referral.referral_letter_acknowledged_at:
                referral.referral_letter_acknowledged_at = escort.arrival_confirmed_at
                referral.referral_letter_acknowledged_by = request.user
                referral.save(update_fields=[
                    'referral_letter_acknowledged_at',
                    'referral_letter_acknowledged_by',
                ])

        # Invalidate any cached summary PDF — the next download for this
        # admission will re-render live so the arrival confirmation
        # actually appears in the final audit copy.
        admission = escort.admission
        if admission.summary_pdf_file:
            try:
                admission.summary_pdf_file.delete(save=False)
                admission.summary_pdf_file = None
                admission.summary_pdf_generated_at = None
                admission.save(update_fields=[
                    'summary_pdf_file', 'summary_pdf_generated_at',
                ])
            except Exception:
                logger.exception(
                    'Failed to invalidate cached summary PDF for admission %s',
                    admission.admission_id,
                )

        AuditService.log_activity(
            user=request.user,
            action='update',
            object_type='admission_escort',
            object_id=str(escort.id),
            module='wards',
            object_repr=f'Escort #{escort.id}',
            description=(
                f'Escort arrival confirmed for admission '
                f'{escort.admission.admission_id} at '
                f'{escort.facility_name_snapshot or "—"}'
            ),
            new_values={
                'arrival_confirmed_at': escort.arrival_confirmed_at.isoformat(),
                'outcome': escort.arrival_call_outcome or '',
            },
            request=request,
        )

        serializer = self.get_serializer(escort)
        return Response(serializer.data)


@document_viewset(tag="Wards", resource="admission treatment rows")
class AdmissionTreatmentRowViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
    """Treatment sheet rows for a ward admission (filter: ?admission=)."""

    facility_filter_field = 'admission__visit__location_clinic'
    serializer_class = AdmissionTreatmentRowSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["admission"]
    ordering = ["-created_at"]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return AdmissionTreatmentRow.objects.none()
        
        return self.scope_queryset(
            AdmissionTreatmentRow.objects.select_related("admission", "recorded_by")
        )

    def perform_create(self, serializer):
        ensure_nurse_action(self.request.user)
        serializer.save(recorded_by=self.request.user)
