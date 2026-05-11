"""
Views for the Nursing app.
"""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import NursingOrder, Procedure
from .serializers import NursingOrderSerializer, ProcedureSerializer
from audit.services import AuditService


class NursingOrderViewSet(viewsets.ModelViewSet):
    """ViewSet for managing nursing orders."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = NursingOrderSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'ordered_by', 'status', 'priority', 'order_type', 'consultation_session', 'visit', 'admission']
    search_fields = ['order_id', 'description']
    ordering_fields = ['ordered_at']
    ordering = ['-ordered_at']
    
    def get_queryset(self):
        return NursingOrder.objects.all().select_related(
            'patient', 'ordered_by', 'visit', 'consultation_session', 'created_by', 'admission'
        )
    
    def perform_create(self, serializer):
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


class ProcedureViewSet(viewsets.ModelViewSet):
    """ViewSet for managing procedures."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ProcedureSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'procedure_type', 'performed_by']
    search_fields = ['procedure_id', 'description', 'notes']
    ordering_fields = ['performed_at']
    ordering = ['-performed_at']
    
    def get_queryset(self):
        return Procedure.objects.all().select_related('patient', 'nursing_order', 'visit', 'performed_by')
    
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

