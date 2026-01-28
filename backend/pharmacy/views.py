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
from audit.services import AuditService


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
    
    def perform_create(self, serializer):
        """Create inventory item and log audit."""
        inventory = serializer.save()
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='medication_inventory',
            object_id=str(inventory.id),
            module='pharmacy',
            object_repr=f'Inventory {inventory.batch_number} - {inventory.medication.name}',
            description=f'Created inventory item: {inventory.medication.name} (Batch: {inventory.batch_number}, Qty: {inventory.quantity})',
            new_values={'batch_number': inventory.batch_number, 'quantity': float(inventory.quantity), 'medication_id': str(inventory.medication.id)},
            request=self.request,
        )
    
    def perform_update(self, serializer):
        """Update inventory item and log audit."""
        old_instance = self.get_object()
        old_values = {
            'quantity': float(old_instance.quantity),
            'expiry_date': str(old_instance.expiry_date),
        }
        inventory = serializer.save()
        new_values = {
            'quantity': float(inventory.quantity),
            'expiry_date': str(inventory.expiry_date),
        }
        
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='medication_inventory',
            object_id=str(inventory.id),
            module='pharmacy',
            object_repr=f'Inventory {inventory.batch_number} - {inventory.medication.name}',
            description=f'Updated inventory item: {inventory.medication.name} (Batch: {inventory.batch_number})',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )


class PrescriptionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing prescriptions."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = PrescriptionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'doctor', 'status', 'consultation_session', 'visit']
    search_fields = ['prescription_id', 'diagnosis', 'notes']
    ordering_fields = ['prescribed_at']
    ordering = ['-prescribed_at']
    
    def get_queryset(self):
        return Prescription.objects.all().select_related('patient', 'doctor', 'visit', 'consultation_session', 'created_by').prefetch_related('medications__medication')
    
    def perform_update(self, serializer):
        """Update prescription and log audit."""
        old_instance = self.get_object()
        old_values = {
            'status': old_instance.status,
            'diagnosis': old_instance.diagnosis,
        }
        prescription = serializer.save()
        new_values = {
            'status': prescription.status,
            'diagnosis': prescription.diagnosis,
        }
        
        # Log audit
        AuditService.log_prescription_action(
            user=self.request.user,
            action='update',
            prescription=prescription,
            module='pharmacy',
            description=f'Updated prescription {prescription.prescription_id}',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )
    
    def perform_create(self, serializer):
        # Set doctor from request user if not provided
        if not serializer.validated_data.get('doctor') and self.request.user.is_authenticated:
            prescription = serializer.save(created_by=self.request.user, doctor=self.request.user)
        else:
            prescription = serializer.save(created_by=self.request.user)
        
        # Log audit
        AuditService.log_prescription_action(
            user=self.request.user,
            action='create',
            prescription=prescription,
            module='pharmacy',
            description=f'Created prescription {prescription.prescription_id} for patient {prescription.patient.get_full_name()}',
            request=self.request,
        )
    
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
            
            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='verify',
                object_type='prescription',
                object_id='',
                module='pharmacy',
                object_repr=f'Drug interaction check for {len(medication_ids)} medications',
                description=f'Checked drug interactions for {len(medication_ids)} medications. Found {len(interactions)} interactions.',
                metadata={'medication_ids': medication_ids, 'interactions_count': len(interactions)},
                request=self.request,
            )
            
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

            # Check if dispensing quantity exceeds remaining prescribed amount
            remaining_quantity = item.quantity - item.dispensed_quantity
            if quantity > remaining_quantity:
                return Response(
                    {'error': f'Cannot dispense {quantity} units. Only {remaining_quantity} units remaining to be dispensed.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check if enough quantity available in stock
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
            old_status = prescription.status
            prescription.recalculate_status()
            
            # Log audit
            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='prescription',
                object_id=str(prescription.id),
                module='pharmacy',
                object_repr=f'Prescription {prescription.prescription_id}',
                description=f'Dispensed {quantity} {item.unit} of {item.medication.name} from prescription {prescription.prescription_id}',
                old_values={'status': old_status, 'item_dispensed_quantity': float(item.dispensed_quantity - quantity)},
                new_values={'status': prescription.status, 'item_dispensed_quantity': float(item.dispensed_quantity)},
                metadata={'dispense_id': str(dispense.id), 'batch_number': inventory.batch_number if inventory_id else ''},
                request=self.request,
            )
            
            return Response(DispenseSerializer(dispense).data)
        except (PrescriptionItem.DoesNotExist, MedicationInventory.DoesNotExist) as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=True, methods=['post'], url_path='substitute-item')
    def substitute_item(self, request, pk=None):
        """Substitute medication in a prescription item."""
        prescription = self.get_object()
        item_id = request.data.get('item_id')
        new_medication_id = request.data.get('new_medication_id')
        reason = request.data.get('reason', '')
        notes = request.data.get('notes', '')

        print(f"🔄 SUBSTITUTION DEBUG: Prescription {pk}, Item {item_id}, New Med {new_medication_id}")

        # Debug: Show current prescription medications
        print(f"📋 Current prescription medications:")
        for med in prescription.medications.all():
            print(f"   - {med.medication.name} (ID: {med.id}, MedID: {med.medication.id})")

        try:
            print(f"🔄 Starting substitution for prescription {prescription.id}, item {item_id}, new_med {new_medication_id}")

            # Get the prescription item
            try:
                item = prescription.medications.get(id=item_id)
                print(f"📋 Found prescription item {item.id}")
            except PrescriptionItem.DoesNotExist:
                print(f"❌ Prescription item {item_id} not found in prescription {prescription.id}")
                return Response(
                    {'error': f'Prescription item {item_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            old_medication = item.medication
            print(f"📋 Current medication: {old_medication.name} (ID: {old_medication.id})")

            # Get the new medication
            try:
                from pharmacy.models import Medication
                new_medication = Medication.objects.get(id=new_medication_id)
                print(f"💊 New medication found: {new_medication.name} (ID: {new_medication.id})")
            except Medication.DoesNotExist:
                print(f"❌ New medication {new_medication_id} not found")
                return Response(
                    {'error': f'Medication {new_medication_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Update the prescription item
            print(f"🔄 Updating item.medication from {old_medication.name} to {new_medication.name}")
            item.medication = new_medication
            item.save()
            print(f"✅ Item updated and saved")

            # Verify the change persisted
            item.refresh_from_db()
            print(f"🔍 After refresh: medication is {item.medication.name} (ID: {item.medication.id})")

            # Double-check by re-querying
            recheck_item = prescription.medications.get(id=item_id)
            print(f"🔄 Double-check: medication is {recheck_item.medication.name} (ID: {recheck_item.medication.id})")

            # Log audit
            try:
                AuditService.log_prescription_action(
                    user=self.request.user,
                    prescription=prescription,
                    action='substitute_item',
                    old_values={'medication': old_medication.name, 'medication_id': old_medication.id},
                    new_values={'medication': new_medication.name, 'medication_id': new_medication.id},
                    metadata={'reason': reason, 'notes': notes},
                    request=self.request,
                )
                print("✅ Audit log created")
            except Exception as audit_error:
                print(f"⚠️ Audit logging failed: {audit_error}")

            # Refresh prescription from database to get updated medications
            prescription.refresh_from_db()
            print(f"🔄 After prescription refresh: medications count = {prescription.medications.count()}")
            print(f"📋 After refresh medications:")
            for med in prescription.medications.all():
                print(f"   - {med.medication.name} (ID: {med.id}, MedID: {med.medication.id})")

            # Return updated prescription
            serializer = self.get_serializer(prescription)
            response_data = serializer.data
            print(f"📤 Response contains {len(response_data.get('medications', []))} medications")
            for med in response_data.get('medications', []):
                med_name = med.get('medication_name', med.get('name', 'Unknown'))
                med_id = med.get('id', 'Unknown')
                print(f"   - {med_name} (ID: {med_id})")

            return Response(response_data)

        except Exception as e:
            print(f"❌ Substitution failed: {e}")
            return Response(
                {'error': f'Substitution failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def complete_dispensing(self, request, pk=None):
        """Manually mark a prescription as fully dispensed/completed."""
        prescription = self.get_object()

        # Mark all items as dispensed
        for item in prescription.medications.all():
            if not item.is_dispensed:
                item.is_dispensed = True
                item.save(update_fields=['is_dispensed'])

        # Update prescription status
        prescription.status = 'dispensed'
        if not prescription.dispensed_at:
            from django.utils import timezone
            prescription.dispensed_at = timezone.now()
        prescription.save()

        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='complete_dispensing',
            object_type='prescription',
            object_id=str(prescription.id),
            module='pharmacy',
            object_repr=f'Prescription {prescription.prescription_id}',
            description=f'Manually marked prescription {prescription.prescription_id} as fully dispensed',
            request=self.request,
        )

        # Return updated prescription
        serializer = self.get_serializer(prescription)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def recalculate_status(self, request, pk=None):
        """Recalculate and update prescription status."""
        prescription = self.get_object()
        old_status = prescription.status

        prescription.recalculate_status()
        new_status = prescription.status

        # Log if status changed
        if old_status != new_status:
            AuditService.log_activity(
                user=self.request.user,
                action='recalculate_status',
                object_type='prescription',
                object_id=str(prescription.id),
                module='pharmacy',
                object_repr=f'Prescription {prescription.prescription_id}',
                description=f'Status recalculated: {old_status} → {new_status}',
                request=self.request,
            )

        serializer = self.get_serializer(prescription)
        return Response(serializer.data)


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

