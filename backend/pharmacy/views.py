"""
Views for the Pharmacy app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from django.db.models import Q, F
from decimal import Decimal

from .models import Medication, MedicationInventory, Prescription, PrescriptionItem, Dispense
from .serializers import (
    MedicationSerializer,
    MedicationInventorySerializer,
    PrescriptionSerializer,
    PrescriptionItemSerializer,
    DispenseSerializer,
)


class MedicationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing medications."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = MedicationSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['form', 'is_active']
    search_fields = ['name', 'generic_name', 'code']
    ordering_fields = ['name', 'code']
    ordering = ['name']
    
    def get_queryset(self):
        return Medication.objects.filter(is_active=True)


class MedicationInventoryViewSet(viewsets.ModelViewSet):
    """ViewSet for managing medication inventory."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = MedicationInventorySerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['medication', 'location']
    search_fields = ['medication__name', 'batch_number']
    ordering_fields = ['expiry_date', 'created_at']
    ordering = ['expiry_date']
    
    def get_queryset(self):
        return MedicationInventory.objects.all().select_related('medication')


class PrescriptionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing prescriptions."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = PrescriptionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'doctor', 'status']
    search_fields = ['prescription_id', 'diagnosis', 'notes']
    ordering_fields = ['prescribed_at']
    ordering = ['-prescribed_at']
    
    def get_queryset(self):
        return Prescription.objects.all().select_related('patient', 'doctor', 'visit', 'created_by').prefetch_related('medications')
    
    def perform_create(self, serializer):
        # Set doctor from request user if not provided
        if not serializer.validated_data.get('doctor') and self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user, doctor=self.request.user)
        else:
            serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def dispense(self, request, pk=None):
        """Dispense medication from a prescription."""
        prescription = self.get_object()
        item_id = request.data.get('item_id')
        quantity = Decimal(str(request.data.get('quantity', 0)))
        inventory_id = request.data.get('inventory_id')
        
        try:
            item = prescription.medications.get(id=item_id)
            
            # Check if enough quantity available
            if inventory_id:
                inventory = MedicationInventory.objects.get(id=inventory_id)
                if inventory.quantity < quantity:
                    return Response(
                        {'error': 'Insufficient stock'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                inventory.quantity -= quantity
                inventory.save()
            
            # Create dispense record
            dispense = Dispense.objects.create(
                prescription=prescription,
                prescription_item=item,
                medication=item.medication,
                inventory_item=inventory if inventory_id else None,
                quantity=quantity,
                unit=item.unit,
                batch_number=inventory.batch_number if inventory_id else '',
                dispensed_by=request.user,
                notes=request.data.get('notes', '')
            )
            
            # Update prescription item
            item.dispensed_quantity += quantity
            if item.dispensed_quantity >= item.quantity:
                item.is_dispensed = True
            
            # Update prescription status
            all_dispensed = all(m.is_dispensed for m in prescription.medications.all())
            if all_dispensed:
                prescription.status = 'dispensed'
                prescription.dispensed_at = timezone.now()
            else:
                prescription.status = 'partially_dispensed'
            prescription.save()
            item.save()
            
            return Response(DispenseSerializer(dispense).data)
        except (PrescriptionItem.DoesNotExist, MedicationInventory.DoesNotExist) as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_404_NOT_FOUND
            )


class DispenseViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing dispense history."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = DispenseSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['prescription', 'medication', 'dispensed_by']
    ordering_fields = ['dispensed_at']
    ordering = ['-dispensed_at']
    
    def get_queryset(self):
        return Dispense.objects.all().select_related('prescription', 'medication', 'dispensed_by', 'inventory_item')


class InventoryAlertViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for inventory alerts (low stock, expiring items)."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = MedicationInventorySerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    ordering_fields = ['expiry_date', 'quantity']
    ordering = ['expiry_date']
    
    def get_queryset(self):
        """Get inventory items that need attention."""
        alert_type = self.request.query_params.get('type', 'all')
        queryset = MedicationInventory.objects.all().select_related('medication')
        
        if alert_type == 'low_stock':
            # Items below minimum stock level
            queryset = queryset.filter(quantity__lte=F('min_stock_level'))
        elif alert_type == 'expiring':
            # Items expiring in next 30 days
            from datetime import timedelta
            expiry_threshold = timezone.now().date() + timedelta(days=30)
            queryset = queryset.filter(expiry_date__lte=expiry_threshold, expiry_date__gte=timezone.now().date())
        elif alert_type == 'expired':
            # Already expired items
            queryset = queryset.filter(expiry_date__lt=timezone.now().date())
        elif alert_type == 'all':
            # All alerts
            from datetime import timedelta
            expiry_threshold = timezone.now().date() + timedelta(days=30)
            queryset = queryset.filter(
                Q(quantity__lte=F('min_stock_level')) |
                Q(expiry_date__lte=expiry_threshold)
            )
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get summary of inventory alerts."""
        from datetime import timedelta
        
        expiry_threshold = timezone.now().date() + timedelta(days=30)
        today = timezone.now().date()
        
        summary = {
            'low_stock_count': MedicationInventory.objects.filter(
                quantity__lte=F('min_stock_level')
            ).count(),
            'expiring_count': MedicationInventory.objects.filter(
                expiry_date__lte=expiry_threshold,
                expiry_date__gte=today
            ).count(),
            'expired_count': MedicationInventory.objects.filter(
                expiry_date__lt=today
            ).count(),
            'total_alerts': MedicationInventory.objects.filter(
                Q(quantity__lte=F('min_stock_level')) |
                Q(expiry_date__lte=expiry_threshold)
            ).count(),
        }
        
        return Response(summary)

