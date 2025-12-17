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
from .pagination import FlexiblePageNumberPagination


def check_drug_interactions(medication_ids):
    """
    Check for drug interactions between medications.
    This is a basic implementation - in production, integrate with a drug interaction database/API.
    """
    interactions = []
    
    if len(medication_ids) < 2:
        return interactions
    
    # Get medication objects
    medications = Medication.objects.filter(id__in=medication_ids).values_list('id', 'name', 'generic_name')
    med_dict = {med[0]: {'name': med[1], 'generic': med[2]} for med in medications}
    
    # Basic interaction rules (expand this with real drug interaction database)
    # Example: ACE inhibitors + Potassium supplements = Hyperkalemia risk
    # Example: Warfarin + Aspirin = Increased bleeding risk
    # Example: Beta-blockers + Calcium channel blockers = Bradycardia/hypotension risk
    
    # Convert to list for easier iteration
    med_list = list(medication_ids)
    
    # Check each pair
    for i in range(len(med_list)):
        for j in range(i + 1, len(med_list)):
            med1_id = med_list[i]
            med2_id = med_list[j]
            
            med1 = med_dict.get(med1_id)
            med2 = med_dict.get(med2_id)
            
            if not med1 or not med2:
                continue
            
            # Basic interaction checking based on categories/generic names
            med1_name = (med1['generic'] or med1['name']).lower()
            med2_name = (med2['generic'] or med2['name']).lower()
            
            # Example interactions (this should be replaced with proper drug interaction API)
            interaction = None
            
            # Check for known interaction patterns
            if any(term in med1_name for term in ['warfarin', 'aspirin', 'clopidogrel']) and \
               any(term in med2_name for term in ['warfarin', 'aspirin', 'clopidogrel', 'ibuprofen']):
                interaction = {
                    'drug1': med1['name'],
                    'drug2': med2['name'],
                    'severity': 'Major',
                    'description': 'Increased risk of bleeding when anticoagulants are combined',
                    'recommendation': 'Monitor for signs of bleeding. Consider alternative medication or adjust dosages under medical supervision.'
                }
            elif any(term in med1_name for term in ['ace inhibitor', 'lisinopril', 'enalapril', 'captopril']) and \
                 any(term in med2_name for term in ['potassium', 'spironolactone', 'amiloride']):
                interaction = {
                    'drug1': med1['name'],
                    'drug2': med2['name'],
                    'severity': 'Moderate',
                    'description': 'Risk of hyperkalemia when ACE inhibitors are combined with potassium supplements or potassium-sparing diuretics',
                    'recommendation': 'Monitor serum potassium levels regularly. Avoid potassium supplements unless prescribed.'
                }
            elif any(term in med1_name for term in ['beta blocker', 'propranolol', 'metoprolol', 'atenolol']) and \
                 any(term in med2_name for term in ['calcium channel blocker', 'verapamil', 'diltiazem']):
                interaction = {
                    'drug1': med1['name'],
                    'drug2': med2['name'],
                    'severity': 'Moderate',
                    'description': 'Combination may cause bradycardia, hypotension, or heart block',
                    'recommendation': 'Monitor heart rate and blood pressure closely. Use with caution, especially in elderly patients.'
                }
            
            if interaction:
                interactions.append(interaction)
    
    return interactions


class MedicationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing medications."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = MedicationSerializer
    pagination_class = FlexiblePageNumberPagination
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
    pagination_class = FlexiblePageNumberPagination
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
    
    @action(detail=False, methods=['post'])
    def check_interactions(self, request):
        """Check for drug interactions between medications."""
        medication_ids = request.data.get('medication_ids', [])
        
        if not medication_ids:
            return Response(
                {'error': 'medication_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Convert to integers
            medication_ids = [int(id) for id in medication_ids]
            interactions = check_drug_interactions(medication_ids)
            return Response({'interactions': interactions})
        except (ValueError, TypeError) as e:
            return Response(
                {'error': 'Invalid medication_ids format'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
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
            # Mark as dispensed if dispensed quantity meets or exceeds required quantity
            if item.dispensed_quantity >= item.quantity:
                item.is_dispensed = True
            item.save()
            
            # Recalculate prescription status based on all items
            prescription.recalculate_status()
            
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

