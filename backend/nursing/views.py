"""
Views for the Nursing app.
"""
from datetime import timedelta

from django.db.models import Case, Count, IntegerField, Q, When
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from drf_spectacular.utils import extend_schema, extend_schema_view

from common.mixins import ClinicScopedMixin
from common.openapi import document_viewset
from accounts.utils import resolve_clinic_id
from organization.models import SystemConfig
from .models import NursingOrder, Procedure
from .serializers import NursingOrderSerializer, ProcedureSerializer
from .admission_orders import filter_orders_for_admission
from audit.services import AuditService


@extend_schema_view(
    list=extend_schema(summary="List nursing orders", tags=["Nursing"]),
    retrieve=extend_schema(summary="Retrieve nursing order", tags=["Nursing"]),
    create=extend_schema(summary="Create nursing order", tags=["Nursing"]),
    update=extend_schema(summary="Update nursing order", tags=["Nursing"]),
    partial_update=extend_schema(summary="Partially update nursing order", tags=["Nursing"]),
    destroy=extend_schema(summary="Delete nursing order", tags=["Nursing"]),
)
class NursingOrderViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing nursing orders."""
    serializer_class = NursingOrderSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'ordered_by', 'status', 'priority', 'order_type', 'consultation_session', 'visit', 'admission']
    search_fields = [
        'order_id',
        'description',
        'patient__first_name',
        'patient__surname',
        'patient__patient_id',
        'patient__personal_number',
    ]
    ordering_fields = ['ordered_at']
    ordering = ['-ordered_at']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return NursingOrder.objects.none()
        
        qs = (
            NursingOrder.objects.all()
            .select_related(
                'patient',
                'patient__medical_history',
                'ordered_by',
                'visit',
                'consultation_session',
                'created_by',
                'admission',
            )
        )
        if self.request.query_params.get('procedures_queue') == '1':
            # Ward instructions are doctor orders on an existing admission (Ward Care).
            # Observation admissions are created at consultation handoff (Ward Care), not here.
            qs = qs.exclude(order_type__iexact='ward instruction')
            qs = qs.exclude(order_type__iexact='observation admission')
            qs = qs.exclude(is_informational=True)

        from common.report_period import apply_date_preset

        df = (self.request.query_params.get('date_filter') or '').strip().lower()
        qs = apply_date_preset(qs, df, 'ordered_at')

        after = (self.request.query_params.get('ordered_at_after') or '').strip()
        before = (self.request.query_params.get('ordered_at_before') or '').strip()
        if after:
            qs = qs.filter(ordered_at__date__gte=after)
        if before:
            qs = qs.filter(ordered_at__date__lte=before)

        gender = (self.request.query_params.get('patient_gender') or '').strip().lower()
        if gender in ('male', 'female'):
            qs = qs.filter(patient__gender=gender)

        qt = (self.request.query_params.get('queue_type') or 'all').strip().lower()
        if qt != 'all':
            if qt == 'injection':
                qs = qs.filter(
                    Q(order_type__icontains='injection') | Q(order_type__icontains='iv infusion')
                )
            elif qt == 'dressing':
                qs = qs.filter(
                    Q(order_type__icontains='dressing') | Q(order_type__icontains='wound')
                )
            elif qt == 'medication':
                qs = qs.filter(order_type__icontains='medication')
            elif qt == 'ward_admission':
                qs = qs.filter(
                    Q(order_type__icontains='ward admission')
                    | Q(order_type__icontains='observation admission')
                )

        return self.scope_queryset(qs)

    def filter_queryset(self, queryset):
        for_admission = (self.request.query_params.get('for_admission') or '').strip()
        if for_admission:
            try:
                admission_pk = int(for_admission)
            except (TypeError, ValueError):
                admission_pk = None
            if admission_pk:
                queryset = filter_orders_for_admission(queryset, admission_pk)
            queryset = super().filter_queryset(queryset)
            if self.request.query_params.get("procedures_queue") == "1":
                ordering_param = (self.request.query_params.get("ordering") or "").strip()
                if not ordering_param:
                    queryset = queryset.annotate(
                        _pq_rank=Case(
                            When(priority="urgent", then=0),
                            When(priority="high", then=1),
                            When(priority="medium", then=2),
                            When(priority="low", then=3),
                            default=2,
                            output_field=IntegerField(),
                        )
                    ).order_by("_pq_rank", "ordered_at")
            return queryset

        queryset = super().filter_queryset(queryset)
        if self.request.query_params.get("procedures_queue") == "1":
            ordering_param = (self.request.query_params.get("ordering") or "").strip()
            if not ordering_param:
                queryset = queryset.annotate(
                    _pq_rank=Case(
                        When(priority="urgent", then=0),
                        When(priority="high", then=1),
                        When(priority="medium", then=2),
                        When(priority="low", then=3),
                        default=2,
                        output_field=IntegerField(),
                    )
                ).order_by("_pq_rank", "ordered_at")
        return queryset

    @extend_schema(tags=["Nursing"], summary="List stats", description="Procedure queue dashboard cards (replaces 4 parallel COUNT list calls).")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Procedure queue dashboard cards (replaces 4 parallel COUNT list calls)."""
        from common.list_stats import viewset_queryset_excluding_params

        base = viewset_queryset_excluding_params(
            self,
            frozenset({'status', 'queue_type', 'page', 'page_size', 'ordering'}),
        )
        row = base.aggregate(
            total=Count('pk'),
            pending=Count('pk', filter=Q(status='pending')),
            completed=Count('pk', filter=Q(status='completed')),
            injections=Count(
                'pk',
                filter=Q(status='pending')
                & (
                    Q(order_type__icontains='injection')
                    | Q(order_type__icontains='iv infusion')
                ),
            ),
        )
        return Response({
            'total': row['total'] or 0,
            'pending': row['pending'] or 0,
            'completed': row['completed'] or 0,
            'injections': row['injections'] or 0,
        })

    def perform_create(self, serializer):
        self.auto_set_clinic(serializer)
        order = serializer.save(created_by=self.request.user)
        normalized_order_type = (order.order_type or '').strip().lower()
        handoff_suffix = ''
        if normalized_order_type == 'observation admission' and order.consultation_session_id:
            handoff_suffix = ' (consultation handoff to nursing observation queue)'
        
        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='nursing_order',
            object_id=str(order.id),
            module='nursing',
            object_repr=f'Nursing Order {order.order_id}',
            description=f'Created nursing order {order.order_id} for patient {order.patient.get_full_name()}{handoff_suffix}',
            new_values={'order_id': order.order_id, 'order_type': order.order_type, 'priority': order.priority, 'patient_id': str(order.patient.id)},
            request=self.request,
        )

        # Notify Nursing (doctor -> nursing tasks)
        try:
            from notifications.services import NotificationService

            patient_name = order.patient.get_full_name()
            title = "New nursing task"
            message = f"Nursing order {order.order_id} for {patient_name} has been created."

            from notifications.services import priority_from_nursing_order
            notif_priority = priority_from_nursing_order(getattr(order, 'priority', 'medium'))
            urgent_prefix = "URGENT — " if notif_priority == 'urgent' else ''
            NotificationService.notify_role(
                role_name='Nursing Officer',
                title=f"{urgent_prefix}{title}",
                message=message,
                notification_type='workflow',
                priority=notif_priority,
                action_url="/nursing/procedures",
                object_type='nursing_order',
                object_id=str(order.id),
                clinic_id=getattr(self.request.user, 'clinic_id', None),
            )
        except Exception:
            # Notifications must never break order creation
            pass


@document_viewset(tag="Nursing", resource="nursing procedures")
class ProcedureViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing procedures."""
    serializer_class = ProcedureSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'procedure_type', 'performed_by', 'nursing_order']
    search_fields = [
        'procedure_id',
        'description',
        'notes',
        'medication_name',
        'dosage',
        'route',
        'site',
        'patient__first_name',
        'patient__surname',
        'patient__patient_id',
        'patient__personal_number',
        'performed_by__first_name',
        'performed_by__last_name',
        'performed_by__username',
    ]
    ordering_fields = ['performed_at']
    ordering = ['-performed_at']
    
    def scope_queryset(self, qs):
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            clinic_id = resolve_clinic_id(self.request.user)
            if clinic_id is not None:
                qs = qs.filter(
                    Q(nursing_order__location_clinic=clinic_id) |
                    Q(visit__location_clinic=clinic_id) |
                    Q(patient__location_clinic=clinic_id)
                )
        return qs
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Procedure.objects.none()
        
        qs = Procedure.objects.all().select_related(
            'patient',
            'patient__medical_history',
            'nursing_order',
            'nursing_order__ordered_by',
            'visit',
            'performed_by',
        )

        gender = (self.request.query_params.get('patient_gender') or '').strip().lower()
        if gender in ('male', 'female'):
            qs = qs.filter(patient__gender=gender)

        from .procedure_queries import (
            filter_procedures_by_date_preset,
            filter_procedures_by_history_type,
            filter_procedures_by_performed_period,
        )

        df = (self.request.query_params.get('date_filter') or '').strip().lower()
        qs = filter_procedures_by_date_preset(qs, df)

        after = (self.request.query_params.get('performed_at_after') or '').strip()
        before = (self.request.query_params.get('performed_at_before') or '').strip()
        if after or before:
            from django.utils.dateparse import parse_date

            qs = filter_procedures_by_performed_period(
                qs,
                start_date=parse_date(after) if after else None,
                end_date=parse_date(before) if before else None,
            )

        ht = (self.request.query_params.get('history_type') or 'all').strip().lower()
        qs = filter_procedures_by_history_type(qs, ht)

        return qs

    @extend_schema(tags=["Nursing"], summary="History stats", description="Procedures history dashboard cards (replaces 5 parallel COUNT list calls).")
    @action(detail=False, methods=['get'], url_path='history-stats')
    def history_stats(self, request):
        """Procedures history dashboard cards (replaces 5 parallel COUNT list calls)."""
        from common.list_stats import viewset_queryset_excluding_params
        from .procedure_queries import filter_procedures_by_history_type

        base = viewset_queryset_excluding_params(
            self,
            frozenset({'history_type', 'page', 'page_size', 'ordering'}),
        )
        return Response({
            'total': base.count(),
            'injections': filter_procedures_by_history_type(base, 'injection').count(),
            'dressings': filter_procedures_by_history_type(base, 'dressing').count(),
            'medications': filter_procedures_by_history_type(base, 'medication').count(),
            'observations': filter_procedures_by_history_type(base, 'ward_admission').count(),
        })

    @extend_schema(tags=["Nursing"], summary="Resolve", description="Return the latest procedure record for a nursing order.")
    @action(detail=False, methods=['get'], url_path='resolve')
    def resolve_procedure(self, request):
        """Return the latest procedure record for a nursing order."""
        nursing_order_id = request.query_params.get('nursing_order')
        if not nursing_order_id:
            return Response({'detail': 'nursing_order is required'}, status=status.HTTP_400_BAD_REQUEST)
        qs = Procedure.objects.filter(nursing_order_id=nursing_order_id).select_related(
            'patient',
            'patient__medical_history',
            'nursing_order',
            'nursing_order__ordered_by',
            'visit',
            'performed_by',
        )
        procedure = self.scope_queryset(qs).order_by('-performed_at').first()
        if not procedure:
            return Response({'detail': 'Procedure not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(procedure).data)
    
    def perform_create(self, serializer):
        procedure = serializer.save(performed_by=self.request.user)
        
        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='procedure',
            object_id=str(procedure.id),
            module='nursing',
            object_repr=f'Procedure {procedure.procedure_id}',
            description=f'Created procedure {procedure.procedure_id} for patient {procedure.patient.get_full_name()}',
            new_values={'procedure_id': procedure.procedure_id, 'procedure_type': procedure.procedure_type, 'patient_id': str(procedure.patient.id)},
            request=self.request,
        )

