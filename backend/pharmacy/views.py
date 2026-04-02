"""
Views for the Pharmacy app.
"""
import logging
from rest_framework import viewsets, status

logger = logging.getLogger(__name__)
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from django.db import transaction
from django.db.models import Q, F
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from decimal import Decimal, InvalidOperation

from .combo_utils import combo_component_names_from_display_name
from .models import GenericMedication, Medication, MedicationInventory, Prescription, PrescriptionItem, Dispense, StockRequest, StockRequestItem, StockIssue, StockIssueLine, DispensaryReceiptLine
from .serializers import (
    GenericMedicationSerializer,
    MedicationSerializer,
    MedicationInventorySerializer,
    DispensaryReceiptLineSerializer,
    PrescriptionSerializer,
    PrescriptionItemSerializer,
    DispenseSerializer,
    StockRequestSerializer,
    StockIssueSerializer,
)
from .pagination import FlexiblePageNumberPagination
from audit.services import AuditService
from audit.models import ActivityLog


class GenericMedicationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing generic medications."""
    queryset = GenericMedication.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = GenericMedicationSerializer
    pagination_class = FlexiblePageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'route', 'dosage_form', 'category']
    search_fields = ['name', 'active_ingredient', 'category', 'strength', 'dosage_form', 'route']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']

    @action(detail=False, methods=['get'])
    def for_prescription(self, request):
        """Get generics suitable for prescription creation with available brands."""
        # Get active generics
        generics = GenericMedication.objects.filter(is_active=True)
        
        # Apply filters
        search = request.query_params.get('search', '')
        if search:
            search_q = (
                Q(name__icontains=search) |
                Q(active_ingredient__icontains=search) |
                Q(category__icontains=search) |
                Q(strength__icontains=search) |
                Q(dosage_form__icontains=search) |
                Q(route__icontains=search)
            )
            lower_search = search.lower()
            if 'syrup' in lower_search:
                search_q |= Q(dosage_form__icontains='suspension') | Q(dosage_form__icontains='solution')
            if 'suspension' in lower_search:
                search_q |= Q(dosage_form__icontains='syrup')
            generics = generics.filter(search_q)
        
        # Paginate
        page = self.paginate_queryset(generics)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(generics, many=True)
        return Response(serializer.data)


def check_drug_interactions(medication_ids):
    """
    Check for drug interactions between medications.
    This is a basic implementation - in production, integrate with a drug interaction database/API.
    """
    interactions = []
    
    if len(medication_ids) < 2:
        return interactions
    
    # Get medication objects with generic parent
    medications = Medication.objects.filter(id__in=medication_ids).select_related('generic')
    med_dict = {}
    for m in medications:
        med_dict[m.id] = {
            'name': m.name,
            'generic': (m.generic.name if m.generic else None),
            'category': m.category,
            'strength': m.generic.strength if m.generic else m.strength,
            'dosage_form': m.generic.dosage_form if m.generic else m.form,
            'active_ingredient': m.generic.active_ingredient if m.generic else (m.generic_name or m.name),
        }
    
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
            med1_name = (med1.get('active_ingredient') or med1.get('generic') or med1.get('name') or '').lower()
            med2_name = (med2.get('active_ingredient') or med2.get('generic') or med2.get('name') or '').lower()
            
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


@method_decorator(never_cache, name='dispatch')
class MedicationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing medications."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = MedicationSerializer
    pagination_class = FlexiblePageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['form', 'is_active', 'category', 'generic']
    search_fields = ['name', 'generic_name', 'code']
    ordering_fields = ['name', 'code']
    ordering = ['name']
    
    def get_queryset(self):
        return Medication.objects.filter(is_active=True)

    def create(self, request, *args, **kwargs):
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        from rest_framework.response import Response
        from rest_framework import status
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        except ValidationError as ve:
            # Flatten common messages into 'detail' for client extraction
            detail = None
            if isinstance(ve.detail, dict):
                detail = ve.detail.get('detail') or next(iter(ve.detail.values()), None)
                if isinstance(detail, list) and detail:
                    detail = detail[0]
            elif isinstance(ve.detail, list) and ve.detail:
                detail = ve.detail[0]
            detail_str = str(detail or 'Invalid request')
            return Response({'detail': detail_str, 'error': detail_str, 'errors': ve.detail}, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as ie:
            msg = str(ie)
            if 'uniq_brand_per_generic' in msg:
                detail = 'Brand name must be unique per generic.'
            elif 'medications_code_key' in msg or 'code' in msg:
                detail = 'Medication code must be unique.'
            else:
                detail = 'Constraint violation'
            return Response({'detail': detail, 'error': detail, 'errors': {'message': msg}}, status=status.HTTP_400_BAD_REQUEST)


class MedicationInventoryViewSet(viewsets.ModelViewSet):
    """ViewSet for managing medication inventory."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = MedicationInventorySerializer
    pagination_class = FlexiblePageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['medication', 'location', 'medication__category', 'medication__generic']
    search_fields = ['medication__name', 'batch_number']
    ordering_fields = ['expiry_date', 'created_at']
    ordering = ['expiry_date']

    def _is_dispensary_request(self):
        loc = (self.request.query_params.get('location') or '').strip().lower()
        return loc == 'dispensary'

    def get_queryset(self):
        if self._is_dispensary_request():
            return DispensaryReceiptLine.objects.filter(quantity_remaining__gt=0).select_related(
                'medication', 'medication__generic', 'request', 'issue', 'issue__request',
                'stock_issue_line', 'stock_issue_line__source_inventory_item'
            ).order_by('received_at')
        queryset = MedicationInventory.objects.all().select_related('medication')
        stock_status = self.request.query_params.get('stock_status')
        if stock_status:
            if stock_status == 'out':
                queryset = queryset.filter(quantity=0)
            elif stock_status == 'low':
                queryset = queryset.filter(quantity__gt=0, quantity__lte=F('min_stock_level'))
            elif stock_status == 'normal':
                queryset = queryset.filter(quantity__gt=F('min_stock_level'))
                queryset = queryset.filter(
                    Q(max_stock_level__isnull=True) |
                    Q(quantity__lte=F('max_stock_level'))
                )
            elif stock_status == 'over':
                queryset = queryset.filter(quantity__gt=F('max_stock_level'))
        return queryset

    def list(self, request, *args, **kwargs):
        if self._is_dispensary_request():
            return self._list_dispensary_receipts(request, *args, **kwargs)
        return super().list(request, *args, **kwargs)

    def _list_dispensary_receipts(self, request, *args, **kwargs):
        from rest_framework.response import Response
        queryset = self.get_queryset()
        medication_id = request.query_params.get('medication')
        if medication_id:
            queryset = queryset.filter(medication_id=medication_id)
        generic_id = request.query_params.get('medication__generic')
        if generic_id:
            queryset = queryset.filter(medication__generic_id=generic_id)
        search = (request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(medication__name__icontains=search) |
                Q(medication__code__icontains=search) |
                Q(batch_number__icontains=search)
            )
        category = request.query_params.get('medication__category', '').strip()
        if category:
            queryset = queryset.filter(medication__category=category)
        stock_status = request.query_params.get('stock_status')
        if stock_status == 'out':
            queryset = queryset.filter(quantity_remaining=0)
        elif stock_status == 'low':
            queryset = queryset.filter(quantity_remaining__gt=0, quantity_remaining__lte=F('medication__min_stock_level'))
        elif stock_status == 'normal':
            queryset = queryset.filter(quantity_remaining__gt=F('medication__min_stock_level'))
        queryset = queryset.order_by('received_at')
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = DispensaryReceiptLineSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = DispensaryReceiptLineSerializer(queryset, many=True)
        return Response(serializer.data)

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

    @action(detail=True, methods=['get'], url_path='adjustment_history')
    def adjustment_history(self, request, pk=None):
        """
        Return adjustment history for a specific batch inventory item.

        Note: History is derived from ActivityLog records tagged with
        `metadata.batch_adjustment=true` so we don't need a new DB table.
        """
        inventory = self.get_object()

        # Only return records created by our adjustment endpoint.
        # We filter `metadata.batch_adjustment` in Python for DB compatibility.
        logs = (
            ActivityLog.objects.filter(
                module='pharmacy',
                object_type='medication_inventory',
                object_id=str(inventory.id),
            )
            .order_by('-created_at')[:50]
        )

        # Frontend expects `BatchAdjustmentHistory` shape.
        data = []
        for log in logs:
            qty_before = (log.old_values or {}).get('quantity')
            qty_after = (log.new_values or {}).get('quantity')
            meta = log.metadata or {}

            # Only include logs that actually represent a quantity change.
            # (Avoid noise from other updates like expiry changes.)
            if qty_before is None or qty_after is None:
                continue

            # Pull reason from a few potential metadata keys (backwards/forwards compatibility).
            # If none exist (older adjustment style), the UI will show `—`.
            reason_val = (
                meta.get("adjustment_reason")
                or meta.get("reason_display")
                or meta.get("adjustment_reason_display")
                or meta.get("reason")
                or meta.get("adjustmentReason")
                or ""
            )

            data.append(
                {
                    "id": log.id,
                    "batch_inventory": inventory.id,
                    "medication_name": inventory.medication.name if hasattr(inventory, "medication") else None,
                    "batch_number": inventory.batch_number,
                    "quantity_before": float(qty_before or 0),
                    "quantity_after": float(qty_after or 0),
                    "quantity_unit": meta.get("quantity_unit") or (inventory.unit or "units"),
                    "adjustment_reason": reason_val or "",
                    "adjustment_notes": meta.get("adjustment_notes") or "",
                    "created_by": getattr(log.user, "id", None) if getattr(log, "user", None) else None,
                    "created_by_name": (
                        (log.user.get_full_name() if getattr(log.user, "get_full_name", None) else None)
                        or getattr(log.user, "username", None)
                        or (str(log.user) if getattr(log, "user", None) else None)
                    ),
                    "created_at": log.created_at.isoformat(),
                }
            )

        return Response(data)

    @action(detail=True, methods=['post'], url_path='record_adjustment')
    def record_adjustment(self, request, pk=None):
        """
        Record a quantity adjustment for a batch inventory item.

        This updates `quantity` and logs an audit record tagged as a batch adjustment.
        """
        inventory = self.get_object()

        try:
            quantity_after_raw = request.data.get('quantity_after')
            if quantity_after_raw is None:
                return Response({"error": "quantity_after is required"}, status=status.HTTP_400_BAD_REQUEST)
            quantity_after = Decimal(str(quantity_after_raw))
        except (InvalidOperation, TypeError, ValueError):
            return Response({"error": "Invalid quantity_after"}, status=status.HTTP_400_BAD_REQUEST)

        if quantity_after < 0:
            return Response({"error": "Stock cannot be negative"}, status=status.HTTP_400_BAD_REQUEST)

        adjustment_reason = (request.data.get('adjustment_reason') or '').strip()
        if not adjustment_reason:
            return Response({"error": "adjustment_reason is required"}, status=status.HTTP_400_BAD_REQUEST)

        adjustment_notes = request.data.get('adjustment_notes') or ""

        qty_before = inventory.quantity
        inventory.quantity = quantity_after
        inventory.save(update_fields=['quantity'])

        # Log a tagged audit record so we can reconstruct history.
        AuditService.log_activity(
            user=request.user,
            action='update',
            object_type='medication_inventory',
            object_id=str(inventory.id),
            module='pharmacy',
            object_repr=f'Inventory {inventory.batch_number} - {inventory.medication.name}',
            description=f'Batch adjustment recorded for {inventory.batch_number}.',
            old_values={'quantity': float(qty_before or 0)},
            new_values={'quantity': float(inventory.quantity or 0)},
            metadata={
                'batch_adjustment': True,
                'adjustment_reason': adjustment_reason,
                'adjustment_notes': adjustment_notes,
                'quantity_unit': inventory.unit or 'units',
            },
            request=request,
        )

        # Return the created history record using the same response shape.
        latest_log = (
            ActivityLog.objects.filter(
                module='pharmacy',
                object_type='medication_inventory',
                object_id=str(inventory.id),
            )
            .order_by('-created_at')
            .first()
        )
        if latest_log and not (latest_log.metadata or {}).get('batch_adjustment'):
            # In case the newest matching log isn't a batch adjustment,
            # pick the next one that is.
            latest_log = next(
                (
                    l
                    for l in ActivityLog.objects.filter(
                        module='pharmacy',
                        object_type='medication_inventory',
                        object_id=str(inventory.id),
                    ).order_by('-created_at')[:20]
                    if (l.metadata or {}).get('batch_adjustment')
                ),
                None,
            )

        meta = (latest_log.metadata or {}) if latest_log else {}
        return Response(
            {
                "id": latest_log.id if latest_log else None,
                "batch_inventory": inventory.id,
                "medication_name": inventory.medication.name if hasattr(inventory, "medication") else None,
                "batch_number": inventory.batch_number,
                "quantity_before": float(qty_before or 0),
                "quantity_after": float(inventory.quantity or 0),
                "quantity_unit": meta.get("quantity_unit") or (inventory.unit or "units"),
                "adjustment_reason": meta.get("adjustment_reason") or adjustment_reason,
                "adjustment_notes": meta.get("adjustment_notes") or adjustment_notes,
                "created_by": getattr(latest_log.user, "id", None) if latest_log and getattr(latest_log, "user", None) else None,
                "created_by_name": (
                    (latest_log.user.get_full_name() if latest_log and getattr(latest_log.user, "get_full_name", None) else None)
                    or (getattr(latest_log.user, "username", None) if latest_log and getattr(latest_log, "user", None) else None)
                    or (str(latest_log.user) if latest_log and getattr(latest_log, "user", None) else None)
                ),
                "created_at": (latest_log.created_at.isoformat() if latest_log else None),
            }
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
        return Prescription.objects.all().select_related(
            'patient', 'doctor', 'visit', 'consultation_session', 'created_by'
        ).prefetch_related(
            'medications__medication',
            'medications__dispenses',
            'consultation_session__diagnoses__icd10_code',
            'visit__diagnoses__icd10_code',
        )
    
    def perform_update(self, serializer):
        """Update prescription and log audit."""
        prescription = serializer.save()
        
        # Log audit
        AuditService.log_prescription_action(
            user=self.request.user,
            action='update',
            prescription=prescription,
            module='pharmacy',
            description=f'Updated prescription {prescription.prescription_id}',
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

        # Notify Pharmacy (doctor -> pharmacy)
        try:
            from notifications.services import NotificationService

            patient_name = prescription.patient.get_full_name()
            title = "New prescription order"
            message = f"Prescription {prescription.prescription_id} for {patient_name} is ready for Pharmacy."

            NotificationService.notify_role(
                role_name='Pharmacist',
                title=title,
                message=message,
                notification_type='prescription',
                priority='normal',
                action_url="/pharmacy/prescriptions",
                object_type='prescription',
                object_id=str(prescription.id),
            )
        except Exception:
            # Notifications must never break prescription creation
            pass

    @staticmethod
    def _resolve_generic_component(component_name: str):
        base_qs = GenericMedication.objects.filter(is_active=True)
        exact = base_qs.filter(name__iexact=component_name).first()
        if exact:
            return exact
        starts = base_qs.filter(name__istartswith=component_name).order_by('name').first()
        if starts:
            return starts
        contains = base_qs.filter(name__icontains=component_name).order_by('name').first()
        return contains

    @action(detail=True, methods=['post'], url_path='split-combo-item')
    def split_combo_item(self, request, pk=None):
        """Split a combo prescription item (e.g., A/B) into separate component items."""
        prescription = self.get_object()
        raw_item_id = request.data.get('item_id')
        if raw_item_id is None or raw_item_id == '':
            return Response({'error': 'item_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            item_id = int(raw_item_id)
        except (TypeError, ValueError):
            return Response({'error': 'item_id must be a valid integer'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            item = prescription.medications.get(id=item_id)
        except PrescriptionItem.DoesNotExist:
            return Response({'error': f'Prescription item {item_id} not found'}, status=status.HTTP_404_NOT_FOUND)

        if item.is_dispensed or (item.dispensed_quantity or 0) > 0:
            return Response(
                {'error': 'Cannot split an item that has already been dispensed (fully or partially).'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if getattr(item, 'superseded_at', None):
            return Response(
                {'error': 'This line was already superseded and cannot be split again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        combo_name = getattr(getattr(item, 'generic', None), 'name', '') or ''
        component_names = combo_component_names_from_display_name(combo_name)
        if len(component_names) < 2:
            return Response(
                {'error': 'This medication is not recognized as a splittable combination.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        resolved_components = []
        missing = []
        for comp in component_names:
            generic = self._resolve_generic_component(comp)
            if not generic:
                missing.append(comp)
                continue
            resolved_components.append(generic)

        if missing:
            return Response(
                {
                    'error': 'Some components are missing in Generic master.',
                    'missing_components': missing,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        seen_gid = set()
        unique_generics = []
        for g in resolved_components:
            if g.id in seen_gid:
                continue
            seen_gid.add(g.id)
            unique_generics.append(g)

        if len(unique_generics) < 2:
            return Response(
                {
                    'error': 'Combination resolves to fewer than two distinct ingredients. '
                    'Check generic names in the master list or contact support.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            created_ids = []
            for generic in unique_generics:
                created = PrescriptionItem.objects.create(
                    prescription=prescription,
                    generic=generic,
                    medication=None,
                    quantity=item.quantity,
                    unit=item.unit,
                    dosage_form=item.dosage_form or getattr(generic, 'dosage_form', '') or '',
                    strength=item.strength or getattr(generic, 'strength', '') or '',
                    dose=item.dose,
                    frequency=item.frequency,
                    duration=item.duration,
                    route=item.route,
                    instructions=item.instructions or f'Split from combo: {combo_name}',
                    dispensed_quantity=0,
                    is_dispensed=False,
                )
                created_ids.append(created.id)

            old_med_name = item.medication.name if item.medication else combo_name
            item.superseded_at = timezone.now()
            item.superseded_split_into_ids = list(created_ids)
            item.save(update_fields=['superseded_at', 'superseded_split_into_ids'])

            prescription.recalculate_status()

            AuditService.log_activity(
                user=self.request.user,
                action='update',
                object_type='prescription',
                object_id=str(prescription.id),
                module='pharmacy',
                object_repr=f'Prescription {prescription.prescription_id}',
                description=f'Split combo medication "{old_med_name}" into component items.',
                old_values={'item_id': int(item_id), 'medication': old_med_name},
                new_values={'created_item_ids': created_ids, 'components': [g.name for g in unique_generics]},
                metadata={'source_item_id': int(item_id), 'combo_name': combo_name},
                request=self.request,
            )

        serializer = self.get_serializer(prescription)
        return Response(serializer.data)
    
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
        coverage_quantity_raw = request.data.get('coverage_quantity', None)
        try:
            quantity = Decimal(str(request.data.get('quantity', 0)))
            coverage_quantity = (
                Decimal(str(coverage_quantity_raw))
                if coverage_quantity_raw not in (None, '')
                else quantity
            )
        except (InvalidOperation, TypeError, ValueError):
            return Response(
                {'error': 'Invalid quantity or coverage_quantity'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if quantity <= 0:
            return Response(
                {'error': 'Dispense quantity must be greater than zero'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if coverage_quantity <= 0:
            return Response(
                {'error': 'Coverage quantity must be greater than zero'},
                status=status.HTTP_400_BAD_REQUEST
            )
        inventory_id = request.data.get('inventory_id')
        receipt_line_id = request.data.get('receipt_line_id')
        inventory = None
        receipt_line = None

        try:
            item = prescription.medications.get(id=item_id)
            if getattr(item, 'superseded_at', None):
                return Response(
                    {'error': 'This line is a prescribing record only (e.g. original combo before split). Dispense the replacement lines instead.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            dispensed_medication = item.medication

            if receipt_line_id:
                receipt_line = DispensaryReceiptLine.objects.select_related('medication').get(id=receipt_line_id)
                if receipt_line.quantity_remaining < quantity:
                    return Response(
                        {'error': 'Insufficient stock'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                dispensed_medication = receipt_line.medication
                receipt_line.quantity_remaining -= quantity
                receipt_line.save(update_fields=['quantity_remaining'])
            elif inventory_id:
                inventory = MedicationInventory.objects.get(id=inventory_id)
                if inventory.quantity < quantity:
                    return Response(
                        {'error': 'Insufficient stock'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                inventory.quantity -= quantity
                inventory.save()
                dispensed_medication = inventory.medication
            elif not dispensed_medication:
                return Response(
                    {'error': 'Cannot determine medication brand. Please select specific inventory or receipt.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Backward-compatible fallback for liquid prescriptions dispensed as bottles:
            # if coverage_quantity is not provided, infer clinical coverage from bottle pack size.
            if coverage_quantity_raw in (None, ''):
                try:
                    item_unit = (item.unit or '').strip().lower()
                    stock_unit = (getattr(dispensed_medication, 'unit', '') or '').strip().lower()
                    if item_unit == 'ml' and stock_unit in ('bottle', 'bottles'):
                        pack_size = getattr(dispensed_medication, 'pack_size', None)
                        if pack_size and Decimal(str(pack_size)) > 0:
                            remaining = max(Decimal('0'), item.quantity - item.dispensed_quantity)
                            inferred_coverage = quantity * Decimal(str(pack_size))
                            coverage_quantity = min(remaining, inferred_coverage)
                except Exception:
                    # Never fail dispense because of fallback inference
                    pass

            batch_number = ''
            if receipt_line:
                batch_number = receipt_line.batch_number or ''
            elif inventory:
                batch_number = inventory.batch_number or ''

            # Snapshot prescribed context at dispense-time so history remains immutable.
            if not item.medication_id:
                dispense_context = 'brand_selected_from_generic'
            elif item.medication_id == dispensed_medication.id:
                dispense_context = 'as_selected_brand'
            else:
                # If brand differs but generic family is same, treat as brand selection (not substitution).
                item_generic_id = getattr(item.medication, 'generic_id', None)
                dispensed_generic_id = getattr(dispensed_medication, 'generic_id', None)
                if item_generic_id and dispensed_generic_id and item_generic_id == dispensed_generic_id:
                    dispense_context = 'brand_selected_from_generic'
                else:
                    dispense_context = 'substituted'

            dispense = Dispense.objects.create(
                prescription=prescription,
                prescription_item=item,
                medication=dispensed_medication,
                inventory_item=inventory,
                dispensary_receipt_line=receipt_line,
                quantity=quantity,
                unit=getattr(dispensed_medication, 'unit', None) or item.unit,
                batch_number=batch_number,
                prescribed_generic_name_snapshot=getattr(item.generic, 'name', '') or '',
                prescribed_medication_name_snapshot=getattr(item.medication, 'name', '') or '',
                prescribed_unit_snapshot=item.unit or '',
                dispense_context_snapshot=dispense_context,
                dispensed_by=request.user,
                notes=request.data.get('notes', '')
            )
            
            # Update prescription item
            item.dispensed_quantity += coverage_quantity
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
                description=f'Dispensed {quantity} {dispense.unit} of {dispensed_medication.name} from prescription {prescription.prescription_id}',
                old_values={'status': old_status, 'item_dispensed_quantity': float(item.dispensed_quantity - coverage_quantity)},
                new_values={'status': prescription.status, 'item_dispensed_quantity': float(item.dispensed_quantity)},
                metadata={
                    'dispense_id': str(dispense.id),
                    'batch_number': batch_number,
                    'coverage_quantity': float(coverage_quantity),
                    'coverage_unit': item.unit,
                },
                request=self.request,
            )
            
            return Response(DispenseSerializer(dispense).data)
        except (PrescriptionItem.DoesNotExist, MedicationInventory.DoesNotExist, DispensaryReceiptLine.DoesNotExist) as e:
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
            if med.medication:
                print(f"   - {med.medication.name} (ID: {med.id}, MedID: {med.medication.id})")
            else:
                print(f"   - {med.generic.name} (ID: {med.id}, GenericID: {med.generic.id})")

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

            if getattr(item, 'superseded_at', None):
                return Response(
                    {'error': 'This line is a prescribing record only and cannot be substituted.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            old_medication = item.medication
            if old_medication:
                print(f"📋 Current medication: {old_medication.name} (ID: {old_medication.id})")
            else:
                print(f"📋 Current generic: {item.generic.name} (ID: {item.generic.id})")

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
            old_med_name = old_medication.name if old_medication else item.generic.name
            print(f"🔄 Updating item.medication from {old_med_name} to {new_medication.name}")
            item.medication = new_medication
            item.save()
            print(f"✅ Item updated and saved")

            # Verify the change persisted
            item.refresh_from_db()
            print(f"🔍 After refresh: medication is {item.medication.name} (ID: {item.medication.id})")

            # Double-check by re-querying
            recheck_item = prescription.medications.get(id=item_id)
            if recheck_item.medication:
                print(f"🔄 Double-check: medication is {recheck_item.medication.name} (ID: {recheck_item.medication.id})")
            else:
                print(f"🔄 Double-check: generic is {recheck_item.generic.name} (ID: {recheck_item.generic.id})")

            # Log audit
            try:
                AuditService.log_prescription_action(
                    user=self.request.user,
                    prescription=prescription,
                    action='substitute_item',
                    old_values={'medication': old_medication.name if old_medication else item.generic.name, 'medication_id': old_medication.id if old_medication else item.generic.id},
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
                if med.medication:
                    print(f"   - {med.medication.name} (ID: {med.id}, MedID: {med.medication.id})")
                else:
                    print(f"   - {med.generic.name} (ID: {med.id}, GenericID: {med.generic.id})")

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

        # Mark all active (non-superseded) items as dispensed
        for item in prescription.medications.all():
            if getattr(item, 'superseded_at', None):
                continue
            if not item.is_dispensed:
                item.is_dispensed = True
                item.save(update_fields=['is_dispensed'])

        # Update prescription status
        prescription.status = 'dispensed'
        if not prescription.dispensing_started_at:
            prescription.dispensing_started_at = timezone.now()
        if not prescription.dispensed_at:
            prescription.dispensed_at = timezone.now()
        prescription.save(update_fields=['status', 'dispensing_started_at', 'dispensed_at'])

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
        return Dispense.objects.all().select_related(
            'prescription', 'medication', 'dispensed_by', 'inventory_item',
            'prescription_item', 'prescription_item__generic', 'prescription_item__medication'
        )


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


class StockRequestViewSet(viewsets.ModelViewSet):
    """ViewSet for managing stock requests."""
    
    queryset = StockRequest.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = StockRequestSerializer
    pagination_class = FlexiblePageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'from_location', 'to_location', 'requested_by']
    search_fields = ['request_id', 'notes']
    ordering_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']

    def get_queryset(self):
        from datetime import datetime
        qs = StockRequest.objects.all()
        date_after = self.request.query_params.get('date_after')
        date_before = self.request.query_params.get('date_before')
        if date_after:
            try:
                dt = datetime.strptime(date_after, '%Y-%m-%d').date()
                qs = qs.filter(created_at__date__gte=dt)
            except ValueError:
                pass
        if date_before:
            try:
                dt = datetime.strptime(date_before, '%Y-%m-%d').date()
                qs = qs.filter(created_at__date__lte=dt)
            except ValueError:
                pass
        return qs
    
    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    def partial_update(self, request, *args, **kwargs):
        """PATCH support: accept items to update quantities."""
        try:
            stock_request = self.get_object()
            items_data = request.data.get('items')
            if items_data is not None and isinstance(items_data, list) and len(items_data) > 0:
                if stock_request.status not in ['pending', 'approved']:
                    return Response(
                        {'error': f'Cannot update items for request with status {stock_request.status}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                for entry in items_data:
                    item_id = entry.get('id')
                    new_qty = entry.get('quantity')
                    if item_id is None or new_qty is None:
                        continue
                    try:
                        item_id = int(item_id)
                        new_qty = max(0, float(new_qty))
                    except (TypeError, ValueError):
                        continue
                    try:
                        item = stock_request.items.get(id=item_id)
                    except StockRequestItem.DoesNotExist:
                        continue
                    fulfilled = float(item.fulfilled_quantity or 0)
                    if new_qty < fulfilled:
                        new_qty = fulfilled
                    item.quantity = Decimal(str(new_qty))
                    item.save()
                stock_request.refresh_from_db()
                serializer = StockRequestSerializer(stock_request)
                return Response({
                    'message': 'Quantities updated',
                    'request': serializer.data
                })
            return super().partial_update(request, *args, **kwargs)
        except Exception as e:
            logger.exception('StockRequest partial_update failed: %s', e)
            raise

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve a stock request.
        Updates status to 'approved'.
        """
        stock_request = self.get_object()
        
        if stock_request.status != 'pending':
            return Response(
                {'error': f'Cannot approve request with status {stock_request.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stock_request.status = 'approved'
        # stock_request.approved_by = request.user
        # stock_request.approved_at = timezone.now()
        stock_request.save()
        
        return Response(StockRequestSerializer(stock_request).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """
        Reject a stock request.
        Updates status to 'rejected'.
        """
        stock_request = self.get_object()
        
        if stock_request.status != 'pending':
            return Response(
                {'error': f'Cannot reject request with status {stock_request.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stock_request.status = 'rejected'
        stock_request.save()
        
        return Response(StockRequestSerializer(stock_request).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """
        Cancel a stock request.
        Updates status to 'cancelled'.
        """
        stock_request = self.get_object()
        
        if stock_request.status != 'pending':
            return Response(
                {'error': f'Cannot cancel request with status {stock_request.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stock_request.status = 'cancelled'
        stock_request.save()
        
        return Response(StockRequestSerializer(stock_request).data)

    @action(detail=True, methods=['post'], url_path='update_items')
    def update_items(self, request, pk=None):
        """
        Update item quantities for a pending or approved request.
        Request body: { "items": [{ "id": <item_id>, "quantity": <number> }, ...] }
        """
        stock_request = self.get_object()
        if stock_request.status not in ['pending', 'approved']:
            return Response(
                {'error': f'Cannot update items for request with status {stock_request.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        items_data = request.data.get('items', [])
        if not items_data:
            return Response(
                {'error': 'No items provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        updated = []
        for entry in items_data:
            item_id = entry.get('id')
            new_qty = entry.get('quantity')
            if item_id is None or new_qty is None:
                continue
            try:
                item_id = int(item_id)
                new_qty = max(0, float(new_qty))
            except (TypeError, ValueError):
                continue

            try:
                item = stock_request.items.get(id=item_id)
            except StockRequestItem.DoesNotExist:
                continue

            # Cannot reduce quantity below already fulfilled amount
            if new_qty < float(item.fulfilled_quantity or 0):
                new_qty = float(item.fulfilled_quantity or 0)

            item.quantity = Decimal(str(new_qty))
            item.save()
            updated.append({'id': item.id, 'quantity': float(item.quantity)})

        stock_request.refresh_from_db()
        return Response({
            'message': f'Updated {len(updated)} item(s)',
            'request': StockRequestSerializer(stock_request).data
        })

    @action(detail=True, methods=['post'])
    def fulfill(self, request, pk=None):
        """
        Fulfill a stock request.
        Creates a StockIssue and moves inventory from source to destination.
        """
        stock_request = self.get_object()
        
        if stock_request.status in ['fulfilled', 'cancelled', 'rejected']:
            return Response(
                {'error': f'Cannot fulfill request with status {stock_request.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if stock_request.status == 'pending':
            return Response(
                {'error': 'Request must be approved before issuing stock.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        issue = None
        lines_created = 0
        unfulfilled_items = []
        
        # Process each requested item
        for item in stock_request.items.all():
            remaining_needed = item.quantity - item.fulfilled_quantity
            if remaining_needed <= 0:
                continue

            # Find available inventory in source location (e.g. 'Store')
            source_inventory_qs = MedicationInventory.objects.filter(
                medication=item.medication,
                location=stock_request.from_location,
                quantity__gt=0,
                expiry_date__gt=timezone.now().date()
            ).order_by('expiry_date') # FIFO
            source_inventory = list(source_inventory_qs)
            available_qty = sum((inv.quantity for inv in source_inventory), Decimal('0'))
            
            qty_to_fulfill = remaining_needed
            
            for inv_item in source_inventory:
                if qty_to_fulfill <= 0:
                    break
                
                transfer_qty = min(inv_item.quantity, qty_to_fulfill)
                if transfer_qty <= 0:
                    continue

                # Create Stock Issue lazily only when we can actually transfer stock.
                if issue is None:
                    issue = StockIssue.objects.create(
                        request=stock_request,
                        issued_by=request.user,
                        notes=f"Fulfilled request {stock_request.request_id}"
                    )
                
                # 1. Deduct from source
                inv_item.quantity -= transfer_qty
                inv_item.save()
                
                # 2 & 3. Destination: Store→Dispensary uses DispensaryReceiptLine; else MedicationInventory
                is_store_to_dispensary = (
                    stock_request.from_location and 'store' in stock_request.from_location.lower()
                ) and (
                    stock_request.to_location and 'dispensary' in stock_request.to_location.lower()
                )

                if is_store_to_dispensary:
                    # Receipt-centric: create issue line with no destination inventory, then DispensaryReceiptLine
                    issue_line = StockIssueLine.objects.create(
                        issue=issue,
                        medication=item.medication,
                        source_inventory_item=inv_item,
                        destination_inventory_item=None,
                        quantity=transfer_qty
                    )
                    DispensaryReceiptLine.objects.create(
                        medication=item.medication,
                        quantity=transfer_qty,
                        quantity_remaining=transfer_qty,
                        received_at=issue.issued_at,
                        request=stock_request,
                        issue=issue,
                        stock_issue_line=issue_line,
                        batch_number=inv_item.batch_number or '',
                        expiry_date=inv_item.expiry_date
                    )
                else:
                    dest_supplier = inv_item.supplier
                    dest_inv, created = MedicationInventory.objects.get_or_create(
                        medication=item.medication,
                        batch_number=inv_item.batch_number,
                        location=stock_request.to_location,
                        defaults={
                            'expiry_date': inv_item.expiry_date,
                            'quantity': 0,
                            'min_stock_level': inv_item.min_stock_level,
                            'unit': inv_item.unit,
                            'supplier': dest_supplier
                        }
                    )
                    if not created:
                        dest_inv.quantity += transfer_qty
                        if dest_inv.min_stock_level == 0 and inv_item.min_stock_level:
                            dest_inv.min_stock_level = inv_item.min_stock_level
                        dest_inv.save()
                    else:
                        dest_inv.quantity = transfer_qty
                        dest_inv.save()
                    StockIssueLine.objects.create(
                        issue=issue,
                        medication=item.medication,
                        source_inventory_item=inv_item,
                        destination_inventory_item=dest_inv,
                        quantity=transfer_qty
                    )
                
                qty_to_fulfill -= transfer_qty
                lines_created += 1

            # Update item fulfillment status
            fulfilled_now = remaining_needed - qty_to_fulfill
            item.fulfilled_quantity += fulfilled_now
            item.save()
            if qty_to_fulfill > 0:
                unfulfilled_items.append({
                    'medication': item.medication.name,
                    'requested': str(remaining_needed),
                    'available': str(available_qty),
                    'shortfall': str(qty_to_fulfill),
                    'reason': 'insufficient_or_expired_stock_in_source_location',
                })

        # Update Request Status
        all_fulfilled = not stock_request.items.filter(fulfilled_quantity__lt=F('quantity')).exists()
        if all_fulfilled:
            stock_request.status = 'fulfilled'
        elif lines_created > 0:
            stock_request.status = 'partially_fulfilled'
        else:
            # Force status update for debugging if logic fails
            # But normally we return error.
            # Let's double check if we missed something.
            pass

        if lines_created == 0 and not all_fulfilled:
            # If no lines created and not all fulfilled, return detailed error to help operators act quickly.
            details = []
            for item in unfulfilled_items[:3]:
                details.append(
                    f"{item['medication']}: requested {item['requested']}, available {item['available']}, shortfall {item['shortfall']}"
                )
            error_message = (
                f"Could not issue stock from {stock_request.from_location}. "
                + ("; ".join(details) if details else "No unexpired stock available for requested items.")
            )
            return Response(
                {'error': error_message, 'unfulfilled_items': unfulfilled_items},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stock_request.save()

        # Return result
        return Response({
            'request': StockRequestSerializer(stock_request).data,
            'issue': StockIssueSerializer(issue).data if issue else None
        })

    @action(detail=True, methods=['post'])
    def confirm_receipt(self, request, pk=None):
        """
        Confirm receipt of stock.
        Updates status to 'received'.
        """
        stock_request = self.get_object()
        
        if stock_request.status not in ['fulfilled', 'partially_fulfilled']:
            return Response(
                {'error': f'Cannot confirm receipt for request with status {stock_request.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stock_request.status = 'received'
        stock_request.confirmed_by = request.user
        stock_request.confirmed_at = timezone.now()
        stock_request.confirmed_notes = request.data.get('confirmed_notes', '')
        stock_request.save()
        
        return Response({
            'message': 'Stock receipt confirmed',
            'request': StockRequestSerializer(stock_request).data
        })


class StockIssueViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for listing stock issues (e.g. receipts from Central Store to Dispensary)."""
    queryset = StockIssue.objects.select_related('request', 'issued_by').prefetch_related('lines__medication').all()
    permission_classes = [IsAuthenticated]
    serializer_class = StockIssueSerializer
    pagination_class = FlexiblePageNumberPagination

    def get_queryset(self):
        qs = super().get_queryset()
        to_location = self.request.query_params.get('to_location', '').strip()
        if to_location:
            qs = qs.filter(request__to_location__icontains=to_location)
        return qs.order_by('-issued_at')
