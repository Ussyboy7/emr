"""
Views for the Pharmacy app.
"""
import logging
from datetime import timedelta

from rest_framework import viewsets, status
from rest_framework.exceptions import ValidationError

logger = logging.getLogger(__name__)
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.utils import timezone
from django.db import transaction
from django.db.models import (
    Q,
    F,
    Avg,
    DurationField,
    ExpressionWrapper,
    Sum,
    Min,
    Count,
    OuterRef,
    Subquery,
    Value,
    DecimalField,
    DateField,
    IntegerField,
)
from django.db.models.functions import Coalesce
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from decimal import Decimal, InvalidOperation

from common.mixins import ClinicScopedMixin
from common.openapi import document_viewset
from .combo_utils import combo_component_names_from_display_name
from .models import GenericMedication, Medication, MedicationInventory, Prescription, PrescriptionItem, Dispense, StockRequest, StockRequestItem, StockIssue, StockIssueLine, DispensaryReceiptLine, HodStockIssue
from .serializers import (
    GenericMedicationSerializer,
    MedicationSerializer,
    StoreMedicationStockRowSerializer,
    MedicationInventorySerializer,
    DispensaryReceiptLineSerializer,
    PrescriptionSerializer,
    PrescriptionItemSerializer,
    DispenseSerializer,
    StockRequestSerializer,
    StockIssueSerializer,
    HodStockIssueSerializer,
)
from .pagination import FlexiblePageNumberPagination
from audit.services import AuditService
from audit.models import ActivityLog
from organization.models import SystemConfig
from accounts.utils import resolve_clinic_id


@document_viewset(tag="Pharmacy", resource="generic medications")
class GenericMedicationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing generic medications."""
    queryset = GenericMedication.objects.all()
    serializer_class = GenericMedicationSerializer
    pagination_class = FlexiblePageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'route', 'dosage_form', 'category']
    search_fields = ['name', 'active_ingredient', 'category', 'strength', 'dosage_form', 'route']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']

    @extend_schema(tags=["Pharmacy"], summary="For prescription", description="Get generics suitable for prescription creation with available brands.")
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


def check_drug_interactions(generic_ids=None, medication_ids=None):
    """
    Check for drug interactions among a set of drugs.

    Interactions are evaluated on the :class:`GenericMedication` level
    (active ingredient / therapeutic category). That is the clinically correct
    granularity — brand swaps do not change the molecule — and it matches the
    prescribing flow, which now captures generic IDs rather than brand IDs.

    Args:
        generic_ids: iterable[int] — preferred. Direct :class:`GenericMedication`
            primary keys.
        medication_ids: iterable[int] — legacy. Brand-level
            :class:`Medication` PKs; each is resolved to its parent generic via
            ``Medication.generic_id``. Brands without a linked generic are
            silently skipped (cannot be reasoned about at the molecule level).

    At least one of the two must be supplied. If both are supplied they are
    unioned.

    Returns:
        list[dict]: interaction records with ``drug1``, ``drug2``, ``severity``,
        ``description``, ``recommendation`` keys.
    """
    # Normalize inputs → a dict keyed by generic_id so we de-dup callers that
    # pass the same molecule twice (e.g. two different brands of ibuprofen).
    resolved: dict[int, dict] = {}

    def _ingest_generic(generic_obj, display_label: str | None = None):
        if generic_obj is None or generic_obj.pk is None:
            return
        if generic_obj.pk in resolved:
            return
        resolved[generic_obj.pk] = {
            'generic_id': generic_obj.pk,
            'name': display_label or generic_obj.name,
            'generic_name': generic_obj.name,
            'category': generic_obj.category or '',
            'active_ingredient': generic_obj.active_ingredient or generic_obj.name or '',
        }

    # Preferred path: generic IDs supplied directly.
    if generic_ids:
        try:
            gen_id_list = [int(x) for x in generic_ids]
        except (TypeError, ValueError):
            gen_id_list = []
        if gen_id_list:
            for g in GenericMedication.objects.filter(id__in=gen_id_list):
                _ingest_generic(g)

    # Legacy path: brand IDs → parent generics.
    if medication_ids:
        try:
            med_id_list = [int(x) for x in medication_ids]
        except (TypeError, ValueError):
            med_id_list = []
        if med_id_list:
            brands = Medication.objects.filter(id__in=med_id_list).select_related('generic')
            for brand in brands:
                if brand.generic_id:
                    # Pass brand name as display label so the interaction report
                    # reads naturally in the pharmacy UI (brand-level queue).
                    _ingest_generic(brand.generic, display_label=brand.name)

    if len(resolved) < 2:
        return []

    # Therapeutic-class patterns. This is a basic rule engine; a production
    # deployment should delegate to a curated drug-interaction database.
    # Each rule is (severity, description, recommendation, lhs_terms, rhs_terms).
    _RULES: list[tuple[str, str, str, tuple[str, ...], tuple[str, ...]]] = [
        (
            'Major',
            'Increased risk of bleeding when anticoagulants/antiplatelets are combined',
            'Monitor for signs of bleeding. Consider alternative medication or adjust '
            'dosages under medical supervision.',
            ('warfarin', 'aspirin', 'clopidogrel'),
            ('warfarin', 'aspirin', 'clopidogrel', 'ibuprofen'),
        ),
        (
            'Moderate',
            'Risk of hyperkalemia when ACE inhibitors are combined with potassium '
            'supplements or potassium-sparing diuretics',
            'Monitor serum potassium levels regularly. Avoid potassium supplements '
            'unless prescribed.',
            ('ace inhibitor', 'lisinopril', 'enalapril', 'captopril'),
            ('potassium', 'spironolactone', 'amiloride'),
        ),
        (
            'Moderate',
            'Combination may cause bradycardia, hypotension, or heart block',
            'Monitor heart rate and blood pressure closely. Use with caution, '
            'especially in elderly patients.',
            ('beta blocker', 'propranolol', 'metoprolol', 'atenolol'),
            ('calcium channel blocker', 'verapamil', 'diltiazem'),
        ),
    ]

    def _match_terms(haystack: str, terms: tuple[str, ...]) -> bool:
        return any(term in haystack for term in terms)

    interactions: list[dict] = []
    entries = list(resolved.values())
    for i in range(len(entries)):
        for j in range(i + 1, len(entries)):
            a, b = entries[i], entries[j]
            a_text = f"{a['active_ingredient']} {a['generic_name']} {a['category']}".lower()
            b_text = f"{b['active_ingredient']} {b['generic_name']} {b['category']}".lower()

            for severity, description, recommendation, lhs, rhs in _RULES:
                hit = (
                    (_match_terms(a_text, lhs) and _match_terms(b_text, rhs))
                    or (_match_terms(b_text, lhs) and _match_terms(a_text, rhs))
                )
                if hit:
                    interactions.append({
                        'drug1': a['name'],
                        'drug2': b['name'],
                        'severity': severity,
                        'description': description,
                        'recommendation': recommendation,
                    })
                    break  # one rule per pair is enough

    return interactions


@method_decorator(never_cache, name='dispatch')
@document_viewset(tag="Pharmacy", resource="medications")
class MedicationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing medications."""
    serializer_class = MedicationSerializer
    pagination_class = FlexiblePageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['form', 'is_active', 'category', 'generic']
    search_fields = ['name', 'generic_name', 'code']
    ordering_fields = ['name', 'code']
    ordering = ['name']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Medication.objects.none()
        
        return Medication.objects.filter(is_active=True)

    @extend_schema(tags=["Pharmacy"], summary="Resolve", description="Top medication match for a search term (interaction checks, substitutes).")
    @action(detail=False, methods=['get'], url_path='resolve')
    def resolve_medication(self, request):
        """Top medication match for a search term (interaction checks, substitutes)."""
        search = (request.query_params.get('search') or '').strip()
        if not search:
            return Response({'detail': 'search is required'}, status=status.HTTP_400_BAD_REQUEST)
        qs = self.get_queryset()
        med = qs.filter(
            Q(name__iexact=search) | Q(generic_name__iexact=search) | Q(code__iexact=search)
        ).first()
        if not med:
            med = qs.filter(
                Q(name__icontains=search)
                | Q(generic_name__icontains=search)
                | Q(code__icontains=search)
            ).order_by('name').first()
        if not med:
            return Response({'detail': 'Medication not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(MedicationSerializer(med).data)

    def _annotate_store_stock(self, queryset, location: str):
        loc = (location or "Store").strip()
        inv_base = MedicationInventory.objects.filter(
            medication_id=OuterRef("pk"),
            location__iexact=loc,
        )
        store_quantity = Coalesce(
            Subquery(
                inv_base.values("medication_id")
                .annotate(t=Sum("quantity"))
                .values("t")[:1],
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
            Value(Decimal("0")),
        )
        nearest_expiry = Subquery(
            inv_base.filter(quantity__gt=0)
            .values("medication_id")
            .annotate(m=Min("expiry_date"))
            .values("m")[:1],
            output_field=DateField(),
        )
        batch_count = Coalesce(
            Subquery(
                inv_base.values("medication_id")
                .annotate(c=Count("id"))
                .values("c")[:1],
                output_field=IntegerField(),
            ),
            Value(0),
        )
        return queryset.annotate(
            store_quantity=store_quantity,
            nearest_expiry=nearest_expiry,
            batch_count=batch_count,
        )

    def _store_stock_summary_queryset(self, request, location: str):
        qs = Medication.objects.filter(is_active=True).select_related("generic")
        qs = self._annotate_store_stock(qs, location)
        stock_status = (request.query_params.get("stock_status") or "all").strip().lower()
        today = timezone.now().date()
        threshold = today + timedelta(days=180)
        if stock_status == "out":
            qs = qs.filter(store_quantity=0)
        elif stock_status == "low":
            qs = qs.filter(
                store_quantity__gt=0,
                store_quantity__lte=F("min_stock_level"),
            )
        elif stock_status == "near_expiry":
            qs = qs.filter(
                store_quantity__gt=0,
                nearest_expiry__isnull=False,
                nearest_expiry__lte=threshold,
                nearest_expiry__gte=today,
            )
        elif stock_status == "normal":
            qs = qs.filter(store_quantity__gt=F("min_stock_level"))
        elif stock_status == "expired":
            qs = qs.filter(store_quantity__gt=0, nearest_expiry__lt=today)

        cat = (request.query_params.get("category") or "").strip()
        if cat and cat.lower() not in ("all categories", "all"):
            qs = qs.filter(category=cat)

        term = (request.query_params.get("search") or "").strip()
        if term:
            qs = qs.filter(
                Q(name__icontains=term)
                | Q(generic_name__icontains=term)
                | Q(generic__name__icontains=term)
            )
        return qs

    @extend_schema(tags=["Pharmacy"], summary="Store stock summary")
    @action(detail=False, methods=["get"], url_path="store-stock-summary")
    def store_stock_summary(self, request):
        location = (request.query_params.get("location") or "Store").strip()
        qs = self._store_stock_summary_queryset(request, location).order_by("name")
        page = self.paginate_queryset(qs)
        if page is not None:
            ser = StoreMedicationStockRowSerializer(page, many=True)
            return self.get_paginated_response(ser.data)
        ser = StoreMedicationStockRowSerializer(qs, many=True)
        return Response(ser.data)

    @extend_schema(tags=["Pharmacy"], summary="Store stock stats")
    @action(detail=False, methods=["get"], url_path="store-stock-stats")
    def store_stock_stats(self, request):
        location = (request.query_params.get("location") or "Store").strip()
        base = Medication.objects.filter(is_active=True).select_related("generic")
        base = self._annotate_store_stock(base, location)
        today = timezone.now().date()
        threshold = today + timedelta(days=180)
        total_units = (
            MedicationInventory.objects.filter(location__iexact=location).aggregate(
                s=Sum("quantity")
            )["s"]
            or Decimal("0")
        )

        def cnt(extra_q):
            return base.filter(extra_q).count()

        return Response(
            {
                "total_medications": base.count(),
                "out_of_stock": cnt(Q(store_quantity=0)),
                "low_stock": cnt(
                    Q(store_quantity__gt=0)
                    & Q(store_quantity__lte=F("min_stock_level"))
                ),
                "near_expiry": cnt(
                    Q(store_quantity__gt=0)
                    & Q(nearest_expiry__isnull=False)
                    & Q(nearest_expiry__lte=threshold)
                    & Q(nearest_expiry__gte=today)
                ),
                "expired": cnt(
                    Q(store_quantity__gt=0) & Q(nearest_expiry__lt=today)
                ),
                "total_units": str(total_units),
            }
        )

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


@document_viewset(tag="Pharmacy", resource="medication inventory")
class MedicationInventoryViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing medication inventory."""
    
    clinic_filter_field = 'location_clinic'
    serializer_class = MedicationInventorySerializer
    pagination_class = FlexiblePageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['medication', 'location', 'location_clinic', 'medication__category', 'medication__generic']
    search_fields = ['medication__name', 'medication__generic__name', 'batch_number']
    ordering_fields = ['expiry_date', 'created_at']
    ordering = ['expiry_date']

    def _is_dispensary_request(self):
        loc = (self.request.query_params.get('location') or '').strip().lower()
        return loc == 'dispensary'

    def _is_hod_store_request(self):
        from pharmacy.hod_store import is_hod_store_location

        loc = self.request.query_params.get('location')
        return is_hod_store_location(loc)

    def _validate_hod_store_access(self):
        """Block HOD store unless user is Head of Pharmacy (or superuser)."""
        if self.request.user.is_superuser:
            return
        from pharmacy.hod_store import user_can_operate_hod_store

        if not user_can_operate_hod_store(self.request.user):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "HOD store is only accessible to the Head of Pharmacy at Bode Thomas Clinic."
            )

    def _validate_store_access(self):
        """Block store access unless the user's active clinic is the central store site."""
        if self.request.user.is_superuser:
            return
        loc = (self.request.query_params.get('location') or '').strip().lower()
        if loc == 'store':
            from pharmacy.central_store import user_can_operate_central_store
            if not user_can_operate_central_store(self.request.user):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(
                    "Central store is only accessible while Bode Thomas Clinic is your active clinic. "
                    "Switch clinic in the top bar and try again."
                )

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return MedicationInventory.objects.none()
        
        if self._is_hod_store_request():
            self._validate_hod_store_access()
        else:
            self._validate_store_access()
        if self._is_dispensary_request():
            qs = DispensaryReceiptLine.objects.all().select_related(
                'medication', 'medication__generic', 'request', 'issue', 'issue__request',
                'stock_issue_line', 'stock_issue_line__source_inventory_item'
            )
            if SystemConfig.is_enabled('multi_clinic_enabled'):
                clinic_id = resolve_clinic_id(self.request.user)
                if clinic_id is not None:
                    qs = qs.filter(location_clinic=clinic_id)
            return qs.order_by('received_at')
        queryset = self.scope_queryset(MedicationInventory.objects.all().select_related('medication'))
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
            elif stock_status == 'near_expiry':
                today = timezone.now().date()
                threshold = today + timedelta(days=180)
                queryset = queryset.filter(
                    quantity__gt=0,
                    expiry_date__lte=threshold,
                    expiry_date__gte=today,
                )
            elif stock_status == 'expired':
                today = timezone.now().date()
                queryset = queryset.filter(quantity__gt=0, expiry_date__lt=today)
        return queryset

    def list(self, request, *args, **kwargs):
        if self._is_dispensary_request():
            return self._list_dispensary_receipts(request, *args, **kwargs)
        return super().list(request, *args, **kwargs)

    def _dispensary_filtered_queryset(self, request, stock_status=None):
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
                Q(medication__name__icontains=search)
                | Q(medication__generic__name__icontains=search)
                | Q(medication__code__icontains=search)
                | Q(batch_number__icontains=search)
            )
        category = request.query_params.get('medication__category', '').strip()
        if category:
            queryset = queryset.filter(medication__category=category)

        status_val = stock_status if stock_status is not None else request.query_params.get('stock_status')
        if not status_val or status_val == 'all':
            queryset = queryset.filter(quantity_remaining__gt=0)
        elif status_val == 'out':
            queryset = queryset.filter(quantity_remaining=0)
        elif status_val == 'low':
            queryset = queryset.filter(
                quantity_remaining__gt=0,
                quantity_remaining__lte=F('medication__min_stock_level'),
            )
        elif status_val == 'normal':
            queryset = queryset.filter(quantity_remaining__gt=F('medication__min_stock_level'))
        elif status_val == 'near_expiry':
            today = timezone.now().date()
            threshold = today + timedelta(days=180)
            queryset = queryset.filter(
                quantity_remaining__gt=0,
                expiry_date__lte=threshold,
                expiry_date__gte=today,
            )
        elif status_val == 'expired':
            today = timezone.now().date()
            queryset = queryset.filter(quantity_remaining__gt=0, expiry_date__lt=today)
        return queryset

    def _store_inventory_filtered_queryset(self, request, stock_status=None):
        queryset = self.scope_queryset(
            MedicationInventory.objects.all().select_related('medication')
        )
        location = request.query_params.get('location')
        if location:
            queryset = queryset.filter(location__iexact=location.strip())
        medication_id = request.query_params.get('medication')
        if medication_id:
            queryset = queryset.filter(medication_id=medication_id)
        generic_id = request.query_params.get('medication__generic')
        if generic_id:
            queryset = queryset.filter(medication__generic_id=generic_id)
        category = (request.query_params.get('medication__category') or '').strip()
        if category:
            queryset = queryset.filter(medication__category=category)
        search = (request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(medication__name__icontains=search)
                | Q(medication__generic__name__icontains=search)
                | Q(batch_number__icontains=search)
            )

        status_val = stock_status if stock_status is not None else request.query_params.get('stock_status')
        if status_val:
            if status_val == 'out':
                queryset = queryset.filter(quantity=0)
            elif status_val == 'low':
                queryset = queryset.filter(quantity__gt=0, quantity__lte=F('min_stock_level'))
            elif status_val == 'normal':
                queryset = queryset.filter(quantity__gt=F('min_stock_level')).filter(
                    Q(max_stock_level__isnull=True) | Q(quantity__lte=F('max_stock_level'))
                )
            elif status_val == 'over':
                queryset = queryset.filter(quantity__gt=F('max_stock_level'))
            elif status_val == 'near_expiry':
                today = timezone.now().date()
                threshold = today + timedelta(days=180)
                queryset = queryset.filter(
                    quantity__gt=0,
                    expiry_date__lte=threshold,
                    expiry_date__gte=today,
                )
            elif status_val == 'expired':
                today = timezone.now().date()
                queryset = queryset.filter(quantity__gt=0, expiry_date__lt=today)
        return queryset

    @extend_schema(tags=["Pharmacy"], summary="List stats", description="Inventory tab counts + total units (replaces parallel COUNT/page fan-out).")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Inventory tab counts + total units (replaces parallel COUNT/page fan-out)."""
        if self._is_hod_store_request():
            self._validate_hod_store_access()
        else:
            self._validate_store_access()
        if self._is_dispensary_request():
            base = self._dispensary_filtered_queryset(request, stock_status='all')
            units_field = 'quantity_remaining'
            count = lambda status: self._dispensary_filtered_queryset(request, stock_status=status).count()
        else:
            base = self._store_inventory_filtered_queryset(request, stock_status=None)
            units_field = 'quantity'
            count = lambda status: self._store_inventory_filtered_queryset(request, stock_status=status).count()

        total_units = base.aggregate(s=Sum(units_field))['s'] or 0
        return Response({
            'total': base.count(),
            'out_of_stock': count('out'),
            'low_stock': count('low'),
            'expiring_soon': count('near_expiry'),
            'expired': count('expired'),
            'total_units': str(total_units),
        })

    def _list_dispensary_receipts(self, request, *args, **kwargs):
        from rest_framework.response import Response
        queryset = self._dispensary_filtered_queryset(request)
        queryset = queryset.order_by('received_at')
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = DispensaryReceiptLineSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = DispensaryReceiptLineSerializer(queryset, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        """Create inventory item and log audit."""
        from pharmacy.hod_store import is_hod_store_location

        location = serializer.validated_data.get('location') or ''
        if is_hod_store_location(location):
            self._validate_hod_store_access()
            raise ValidationError(
                {'location': ['HOD store inventory is updated via stock transfers only.']}
            )
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

    @extend_schema(tags=["Pharmacy"], summary="Adjustment history", description="Return adjustment history for a specific batch inventory item.")
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

    @extend_schema(tags=["Pharmacy"], summary="Record adjustment", description="Record a quantity adjustment for a batch inventory item.")
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


@extend_schema_view(
    list=extend_schema(summary="List prescriptions", tags=["Pharmacy"]),
    retrieve=extend_schema(summary="Retrieve prescription", tags=["Pharmacy"]),
    create=extend_schema(summary="Create prescription", tags=["Pharmacy"]),
    update=extend_schema(summary="Update prescription", tags=["Pharmacy"]),
    partial_update=extend_schema(summary="Partially update prescription", tags=["Pharmacy"]),
    destroy=extend_schema(summary="Delete prescription", tags=["Pharmacy"]),
)
class PrescriptionViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing prescriptions."""
    serializer_class = PrescriptionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['patient', 'doctor', 'status', 'consultation_session', 'visit']
    search_fields = [
        'prescription_id',
        'diagnosis',
        'notes',
        'patient__first_name',
        'patient__surname',
        'patient__middle_name',
        'patient__patient_id',
    ]
    ordering_fields = ['prescribed_at']
    ordering = ['-prescribed_at']
    queryset = Prescription.objects.none()
    
    def _prescription_base_qs(self):
        return Prescription.objects.all().select_related(
            'patient',
            'doctor',
            'visit',
            'visit__location_clinic',
            'consultation_session',
            'consultation_session__location_clinic',
            'consultation_session__room__clinic',
            'location_clinic',
            'created_by',
        ).prefetch_related(
            'medications__medication',
            'medications__dispenses',
            'consultation_session__diagnoses__icd10_code',
            'visit__diagnoses__icd10_code',
        )

    @staticmethod
    def _apply_prescription_list_filters(request, qs):
        params = getattr(request, 'query_params', None) or {}
        gender = (params.get('gender') or 'all').lower()
        if gender in ('male', 'female'):
            qs = qs.filter(patient__gender=gender)
        from common.report_period import apply_date_preset

        date_preset = (params.get('date_preset') or 'all').lower()
        qs = apply_date_preset(qs, date_preset, 'prescribed_at')
        return qs

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Prescription.objects.none()

        qs = self._prescription_base_qs()
        if getattr(self, 'action', None) == 'list':
            qs = self._apply_prescription_list_filters(self.request, qs)
        return self.scope_queryset(qs)

    @extend_schema(tags=["Pharmacy"], summary="Queue stats", description="Counts for the queue matching the same filters as the list (full result set, not one page).")
    @action(detail=False, methods=['get'], url_path='queue-stats')
    def queue_stats(self, request):
        """Counts for the queue matching the same filters as the list (full result set, not one page)."""
        qs = self._apply_prescription_list_filters(request, self._prescription_base_qs())
        qs = self.filter_queryset(qs)
        pending = qs.filter(status='pending').count()
        processing = qs.filter(status='dispensing').count()
        dispensed = qs.filter(Q(status='dispensed') | Q(status='partially_dispensed')).count()
        total = qs.count()
        return Response(
            {
                'pending': pending,
                'processing': processing,
                'dispensed': dispensed,
                'total': total,
            }
        )

    @extend_schema(tags=["Pharmacy"], summary="Home stats", description="Pharmacy home dashboard KPIs in one request.")
    @action(detail=False, methods=['get'], url_path='home-stats')
    def home_stats(self, request):
        """Pharmacy home dashboard KPIs in one request."""
        from datetime import timedelta

        today = timezone.localdate()
        rx_qs = self.scope_queryset(Prescription.objects.all())
        pending_rx = rx_qs.filter(status='pending').count()
        dispensed_today = rx_qs.filter(
            status__in=['dispensed', 'partially_dispensed'],
            dispensed_at__date=today,
        ).count()

        inv_qs = self.scope_queryset(MedicationInventory.objects.all())
        expiry_threshold = today + timedelta(days=30)
        low_stock = inv_qs.filter(quantity__lte=F('min_stock_level')).count()
        total_inventory = inv_qs.count()

        return Response({
            'pendingRx': pending_rx,
            'dispensedToday': dispensed_today,
            'lowStock': low_stock,
            'totalInventory': total_inventory,
        })

    @extend_schema(tags=["Pharmacy"], summary="Dispense context", description="Return batch/stock context for all active prescription lines in one response.")
    @action(detail=True, methods=['get'], url_path='dispense-context')
    def dispense_context(self, request, pk=None):
        """
        Return batch/stock context for all active prescription lines in one response.
        This prevents frontend fan-out calls when opening the dispense modal.
        """
        prescription = self.get_object()
        items = list(
            prescription.medications.select_related("medication").all()
        )
        active_items = [i for i in items if not getattr(i, "superseded_at", None)]

        medication_ids = sorted(
            {
                int(i.medication_id)
                for i in active_items
                if getattr(i, "medication_id", None)
            }
        )

        receipt_qs = (
            DispensaryReceiptLine.objects.filter(
                quantity_remaining__gt=0,
                medication_id__in=medication_ids,
            )
            .select_related("medication")
            .order_by("received_at")
        )
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            clinic_id = resolve_clinic_id(request.user)
            if clinic_id is not None:
                receipt_qs = receipt_qs.filter(location_clinic=clinic_id)

        batches_by_medication = {}
        totals_by_medication = {}
        for line in receipt_qs:
            med_id = int(line.medication_id)
            qty = float(line.quantity_remaining or 0)
            totals_by_medication[med_id] = totals_by_medication.get(med_id, 0.0) + qty
            batches_by_medication.setdefault(med_id, []).append(
                {
                    "id": str(line.id),
                    "batchNumber": line.batch_number or "",
                    "quantity": qty,
                    "expiryDate": str(line.expiry_date) if line.expiry_date else "",
                    "receivedDate": line.received_at.date().isoformat() if line.received_at else "",
                }
            )

        line_context = []
        for item in active_items:
            med_id = int(item.medication_id) if item.medication_id else None
            prescribed = float(item.quantity or 0)
            dispensed = float(item.dispensed_quantity or 0)
            remaining = max(0.0, prescribed - dispensed)
            stock = totals_by_medication.get(med_id, 0.0) if med_id else 0.0
            default_batch_id = None
            if med_id and batches_by_medication.get(med_id):
                default_batch_id = batches_by_medication[med_id][0]["id"]

            line_context.append(
                {
                    "item_id": int(item.id),
                    "medication_id": med_id,
                    "stock": stock,
                    "default_batch_id": default_batch_id,
                    "remaining_quantity": remaining,
                    "batches": batches_by_medication.get(med_id, []) if med_id else [],
                }
            )

        return Response(
            {
                "prescription_id": int(prescription.id),
                "line_context": line_context,
            }
        )

    @staticmethod
    def _prescription_cancel_blocker(prescription):
        if prescription.status in ('dispensed', 'partially_dispensed'):
            return 'Cannot cancel a prescription that has already been dispensed.'

        if prescription.dispenses.exists():
            return 'Cannot cancel a prescription with dispense records.'

        for item in prescription.medications.all():
            if (item.dispensed_quantity or 0) > 0 or item.is_dispensed:
                return 'Cannot cancel a prescription with dispensed medication items.'
            if item.dispenses.exists():
                return 'Cannot cancel a prescription with dispense records.'

        return None
    
    def perform_update(self, serializer):
        """Update prescription and log audit."""
        instance = self.get_object()
        requested_status = serializer.validated_data.get('status')
        if requested_status == 'cancelled' and instance.status != 'cancelled':
            blocker = self._prescription_cancel_blocker(instance)
            if blocker:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'error': blocker})

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
        self.auto_set_clinic(serializer)
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
                clinic_id=getattr(self.request.user, 'clinic_id', None),
            )
        except Exception:
            # Notifications must never break prescription creation
            pass

    @extend_schema(tags=["Pharmacy"], summary="Cancel", description="Cancel a prescription only if no medication has been dispensed.")
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a prescription only if no medication has been dispensed."""
        prescription = self.get_object()
        blocker = self._prescription_cancel_blocker(prescription)
        if blocker:
            return Response({'error': blocker}, status=status.HTTP_400_BAD_REQUEST)

        if prescription.status == 'cancelled':
            return Response(self.get_serializer(prescription).data)

        reason = str(request.data.get('reason') or '').strip()
        old_status = prescription.status
        prescription.status = 'cancelled'
        if reason:
            prescription.notes = f"{prescription.notes}\n\nCancellation reason: {reason}".strip()
        prescription.save(update_fields=['status', 'notes'])

        AuditService.log_activity(
            user=request.user,
            action='cancel',
            object_type='prescription',
            object_id=str(prescription.id),
            module='pharmacy',
            object_repr=f'Prescription {prescription.prescription_id}',
            description=f'Cancelled prescription {prescription.prescription_id}',
            old_values={'status': old_status},
            new_values={'status': prescription.status, 'reason': reason},
            request=request,
        )

        return Response(self.get_serializer(prescription).data)

    @staticmethod
    def _resolve_generic_component(component_name: str):
        base_qs = GenericMedication.objects.filter(is_active=True)
        comp = (component_name or '').strip()
        if not comp:
            return None

        def _is_combo_name(name: str) -> bool:
            return len(combo_component_names_from_display_name(name or '')) > 1

        # Strict mode (no fallback matching): exact single-ingredient generic name only.
        exact_single = base_qs.filter(name__iexact=comp).order_by('name').first()
        if exact_single and not _is_combo_name(exact_single.name):
            return exact_single
        return None

    @staticmethod
    def _create_placeholder_generic_for_component(component_name: str, source_item: PrescriptionItem):
        """
        Create a minimal single-ingredient generic placeholder so split can proceed.
        Pharmacist can then select/substitute actual brand during dispensing.
        """
        comp = (component_name or '').strip()
        if not comp:
            return None

        existing_exact = GenericMedication.objects.filter(name__iexact=comp).order_by('name').first()
        if existing_exact:
            return existing_exact

        placeholder = GenericMedication.objects.create(
            name=comp,
            active_ingredient=comp,
            category='Unmapped (Auto-created for combo split)',
            strength='',
            dosage_form=source_item.dosage_form or '',
            unit=source_item.unit or '',
            route=source_item.route or '',
            is_active=True,
        )
        return placeholder

    @extend_schema(tags=["Pharmacy"], summary="Split combo item", description="Split a combo prescription item (e.g., A/B) into separate component items.")
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
        auto_created_components = []
        for comp in component_names:
            generic = self._resolve_generic_component(comp)
            if not generic:
                placeholder = self._create_placeholder_generic_for_component(comp, item)
                if placeholder:
                    generic = placeholder
                    auto_created_components.append(comp)
                else:
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

        # Refresh instance so serializer sees newly created items instead of any stale prefetch cache.
        prescription.refresh_from_db()
        serializer = self.get_serializer(self.get_queryset().get(pk=prescription.pk))
        payload = dict(serializer.data)
        payload['split_warnings'] = {
            'auto_created_components': auto_created_components,
            'missing_components': missing,
        }
        return Response(payload)
    
    @extend_schema(tags=["Pharmacy"], summary="Check interactions", description="Check for drug interactions between drugs.")
    @action(detail=False, methods=['post'])
    def check_interactions(self, request):
        """
        Check for drug interactions between drugs.

        Request body accepts either (or both):
          * ``generic_ids``:   list[int]  GenericMedication PKs (preferred — this is
                                          the clinically correct level for interaction
                                          checking and matches the new prescribing flow).
          * ``medication_ids``: list[int] Brand-level Medication PKs (legacy —
                                          resolved server-side to their parent
                                          generic).

        At least one must be provided. Brands without a linked generic are silently
        skipped (cannot be reasoned about at the molecule level).
        """
        generic_ids_raw = request.data.get('generic_ids') or []
        medication_ids_raw = request.data.get('medication_ids') or []

        if not generic_ids_raw and not medication_ids_raw:
            return Response(
                {'error': 'Provide generic_ids (preferred) or medication_ids'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            generic_ids = [int(x) for x in generic_ids_raw] if generic_ids_raw else []
            medication_ids = [int(x) for x in medication_ids_raw] if medication_ids_raw else []
        except (ValueError, TypeError):
            return Response(
                {'error': 'Invalid id format in generic_ids or medication_ids'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        interactions = check_drug_interactions(
            generic_ids=generic_ids or None,
            medication_ids=medication_ids or None,
        )

        total_inputs = len(generic_ids) + len(medication_ids)
        AuditService.log_activity(
            user=self.request.user,
            action='verify',
            object_type='prescription',
            object_id='',
            module='pharmacy',
            object_repr=f'Drug interaction check for {total_inputs} drugs',
            description=(
                f'Checked drug interactions for {total_inputs} drugs '
                f'(generic_ids={len(generic_ids)}, medication_ids={len(medication_ids)}). '
                f'Found {len(interactions)} interactions.'
            ),
            metadata={
                'generic_ids': generic_ids,
                'medication_ids': medication_ids,
                'interactions_count': len(interactions),
            },
            request=self.request,
        )

        return Response({'interactions': interactions})
    
    @extend_schema(tags=["Pharmacy"], summary="Dispense", description="Dispense medication from a prescription.")
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
        receipt_line_id = request.data.get('receipt_line_id')
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
                if SystemConfig.is_enabled('multi_clinic_enabled'):
                    clinic_id = resolve_clinic_id(request.user)
                    if clinic_id is not None and receipt_line.location_clinic_id != clinic_id:
                        return Response(
                            {'error': 'This receipt line belongs to a different clinic'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                if receipt_line.quantity_remaining < quantity:
                    return Response(
                        {'error': 'Insufficient stock'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                dispensed_medication = receipt_line.medication
                receipt_line.quantity_remaining -= quantity
                receipt_line.save(update_fields=['quantity_remaining'])
            if not dispensed_medication:
                return Response(
                    {'error': 'Cannot determine medication brand. Please select specific inventory or receipt.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            quantity_entry_mode = (request.data.get('quantity_entry_mode') or '').strip().lower()
            from pharmacy.dispense_units import validate_inventory_units

            try:
                validate_inventory_units(
                    dispensed_medication,
                    quantity,
                    quantity_entry_mode,
                    prescribed_unit=item.unit,
                )
            except Exception as exc:
                from django.core.exceptions import ValidationError as DjangoValidationError
                if isinstance(exc, DjangoValidationError):
                    return Response({'error': exc.messages[0]}, status=status.HTTP_400_BAD_REQUEST)
                raise

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

            batch_number = receipt_line.batch_number if receipt_line else ''

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
                dispensary_receipt_line=receipt_line,
                quantity=quantity,
                quantity_entry_mode=quantity_entry_mode,
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
        except (PrescriptionItem.DoesNotExist, DispensaryReceiptLine.DoesNotExist) as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_404_NOT_FOUND
            )

    @extend_schema(tags=["Pharmacy"], summary="Substitute item", description="Substitute medication in a prescription item.")
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

    @extend_schema(tags=["Pharmacy"], summary="Complete dispensing", description="Manually mark a prescription as fully dispensed/completed.")
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

    @extend_schema(tags=["Pharmacy"], summary="Recalculate status", description="Recalculate and update prescription status.")
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

    @extend_schema(tags=["Pharmacy"], summary="Download", description="Download prescription as PDF.")
    @action(detail=True, methods=['get'], url_path='download')
    def download_prescription(self, request, pk=None):
        """Download prescription as PDF."""
        prescription = self.get_object()
        from .prescription_pdf import build_prescription_pdf
        return build_prescription_pdf(prescription)


@document_viewset(tag="Pharmacy", resource="dispenses", read_only=True)
class DispenseViewSet(ClinicScopedMixin, viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing dispense history."""
    
    clinic_filter_field = 'prescription__location_clinic'
    serializer_class = DispenseSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['prescription', 'medication', 'dispensed_by']
    ordering_fields = ['dispensed_at']
    ordering = ['-dispensed_at']
    queryset = Dispense.objects.none()
    
    @staticmethod
    def _apply_history_filters(request, qs):
        """Match frontend: gender, date_preset (server local calendar), search."""
        params = getattr(request, 'query_params', None) or {}
        gender = (params.get('gender') or 'all').lower()
        if gender in ('male', 'female'):
            qs = qs.filter(prescription__patient__gender=gender)

        from common.report_period import apply_date_preset

        date_preset = (params.get('date_preset') or 'all').lower()
        qs = apply_date_preset(qs, date_preset, 'dispensed_at')

        search = (params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(prescription__prescription_id__icontains=search)
                | Q(dispense_id__icontains=search)
                | Q(prescription__patient__first_name__icontains=search)
                | Q(prescription__patient__surname__icontains=search)
                | Q(prescription__patient__middle_name__icontains=search)
                | Q(prescription__patient__patient_id__icontains=search)
            )
        return qs

    def _base_dispense_qs(self):
        return self.scope_queryset(
            Dispense.objects.all().select_related(
                'prescription', 'medication', 'dispensed_by', 'inventory_item',
                'prescription_item', 'prescription_item__generic', 'prescription_item__medication'
            )
        )

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Dispense.objects.none()

        qs = self._base_dispense_qs()
        if getattr(self, 'action', None) == 'list':
            qs = self._apply_history_filters(self.request, qs)
        return qs

    @extend_schema(tags=["Pharmacy"], summary="Summary stats", description="Dispense KPIs for the same filter set as the history list (not limited to one page).")
    @action(detail=False, methods=['get'], url_path='summary-stats')
    def summary_stats(self, request):
        """
        Dispense KPIs for the same filter set as the history list (not limited to one page).
        Uses configured timezone local calendar for "today".
        """
        qs = self._apply_history_filters(request, self._base_dispense_qs())
        today = timezone.localdate()
        total = qs.count()
        today_count = qs.filter(dispensed_at__date=today).count()
        substitutions = qs.filter(dispense_context_snapshot='substituted').count()

        wait_qs = qs.filter(prescription__dispensing_started_at__isnull=False)
        agg = (
            wait_qs.annotate(
                _wait=ExpressionWrapper(
                    F('dispensed_at') - F('prescription__dispensing_started_at'),
                    output_field=DurationField(),
                )
            ).aggregate(avg_wait=Avg('_wait'))
        )
        avg_td = agg.get('avg_wait')
        avg_minutes = 0
        if avg_td is not None:
            try:
                avg_minutes = max(0, int(avg_td.total_seconds() // 60))
            except Exception:
                avg_minutes = 0

        return Response(
            {
                'total': total,
                'today': today_count,
                'substitutions': substitutions,
                'avg_wait_minutes': avg_minutes,
            }
        )


@document_viewset(tag="Pharmacy", resource="inventory alerts", read_only=True)
class InventoryAlertViewSet(ClinicScopedMixin, viewsets.ReadOnlyModelViewSet):
    """ViewSet for inventory alerts (low stock, expiring items)."""
    
    clinic_filter_field = 'location_clinic'
    serializer_class = MedicationInventorySerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    ordering_fields = ['expiry_date', 'quantity']
    ordering = ['expiry_date']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return MedicationInventory.objects.none()
        
        """Get inventory items that need attention."""
        alert_type = self.request.query_params.get('type', 'all')
        queryset = self.scope_queryset(MedicationInventory.objects.all().select_related('medication'))
        
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
    
    @extend_schema(tags=["Pharmacy"], summary="Summary", description="Get summary of inventory alerts.")
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get summary of inventory alerts."""
        from datetime import timedelta
        
        base = self.scope_queryset(MedicationInventory.objects.all())
        expiry_threshold = timezone.now().date() + timedelta(days=30)
        today = timezone.now().date()
        
        summary = {
            'low_stock_count': base.filter(
                quantity__lte=F('min_stock_level')
            ).count(),
            'expiring_count': base.filter(
                expiry_date__lte=expiry_threshold,
                expiry_date__gte=today
            ).count(),
            'expired_count': base.filter(
                expiry_date__lt=today
            ).count(),
            'total_alerts': base.filter(
                Q(quantity__lte=F('min_stock_level')) |
                Q(expiry_date__lte=expiry_threshold)
            ).count(),
        }
        
        return Response(summary)


@document_viewset(tag="Pharmacy", resource="stock requests")
class StockRequestViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """ViewSet for managing stock requests."""
    
    clinic_filter_field = 'clinic'
    queryset = StockRequest.objects.all()
    serializer_class = StockRequestSerializer
    pagination_class = FlexiblePageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'from_location', 'to_location', 'requested_by', 'clinic']
    search_fields = ['request_id', 'notes']
    ordering_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']

    def auto_set_clinic(self, serializer):
        """Always stamp the requester's clinic; multi-clinic mode still validates explicit picks."""
        clinic_val = serializer.validated_data.get(self.clinic_filter_field)
        if clinic_val is None:
            from accounts.utils import resolve_clinic

            clinic = resolve_clinic(self.request.user)
            if clinic is not None:
                serializer.validated_data[self.clinic_filter_field] = clinic
        else:
            super().auto_set_clinic(serializer)

    def _stock_request_operation(self) -> str:
        action = getattr(self, "action", None) or "read"
        if action == "create":
            return "create"
        if action in ("fulfill", "approve", "reject", "partial_update", "update", "destroy"):
            return "mutate"
        if action == "confirm_receipt":
            return "confirm"
        return "read"

    def _validate_stock_request_access(self, from_location=None, to_location=None, operation=None):
        """Gate stock requests involving Central Store and/or HOD Store."""
        if self.request.user.is_superuser:
            return

        from_loc = from_location
        to_loc = to_location
        if from_loc is None:
            from_loc = self.request.query_params.get('from_location')
        if to_loc is None:
            to_loc = self.request.query_params.get('to_location')
        if from_loc is None and hasattr(self.request, 'data'):
            from_loc = self.request.data.get('from_location')
        if to_loc is None and hasattr(self.request, 'data'):
            to_loc = self.request.data.get('to_location')

        from pharmacy.hod_store import (
            stock_request_involves_central_store,
            stock_request_involves_hod_store,
            user_can_access_stock_request,
        )

        if not stock_request_involves_hod_store(from_loc, to_loc) and not stock_request_involves_central_store(
            from_loc, to_loc
        ):
            return

        op = operation or self._stock_request_operation()
        if not user_can_access_stock_request(self.request.user, from_loc, to_loc, operation=op):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "You do not have permission for this stock request. "
                "Central store approve/issue requires Bode Thomas assignment and store access "
                "(or set Bode Thomas as your active clinic). "
                "Dispensary and ward staff may create and confirm Store→site requests only."
            )

    def _validate_store_access(self):
        """Backward-compatible alias for stock request location checks."""
        self._validate_stock_request_access()

    def scope_queryset(self, qs):
        """Superusers bypass scoping on detail routes; list scoped unless show_all=true."""
        if self.request.user.is_superuser:
            if self.action in ('retrieve', 'update', 'partial_update', 'destroy', 'fulfill', 'approve', 'reject'):
                return qs
            if self.request.query_params.get('show_all') == 'true':
                return qs
        return super().scope_queryset(qs)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return StockRequest.objects.none()
        
        self._validate_stock_request_access()
        from datetime import datetime
        qs = self.scope_queryset(StockRequest.objects.all())
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
    
    def get_object(self):
        obj = super().get_object()
        self._validate_stock_request_access(
            obj.from_location,
            obj.to_location,
            operation=self._stock_request_operation(),
        )
        return obj

    @extend_schema(tags=["Pharmacy"], summary="List stats", description="Tab counts for stock requests (replaces 5+ parallel COUNT requests).")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Tab counts for stock requests (replaces 5+ parallel COUNT requests)."""
        from common.list_stats import viewset_queryset_excluding_params

        qs = viewset_queryset_excluding_params(self, frozenset({'status', 'page', 'page_size', 'ordering'}))
        rows = qs.values('status').annotate(count=Count('id'))
        counts = {row['status']: row['count'] for row in rows}
        partially = counts.get('partially_fulfilled', 0)
        fulfilled = counts.get('fulfilled', 0)
        return Response({
            'total': sum(counts.values()),
            'pending': counts.get('pending', 0),
            'approved': counts.get('approved', 0),
            'confirmed': counts.get('received', 0),
            'awaitingConfirmation': fulfilled + partially,
        })

    def perform_create(self, serializer):
        self._validate_stock_request_access(
            serializer.validated_data.get('from_location'),
            serializer.validated_data.get('to_location'),
            operation="create",
        )
        self.auto_set_clinic(serializer)
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

    @extend_schema(tags=["Pharmacy"], summary="Approve", description="Approve a stock request.")
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

    @extend_schema(tags=["Pharmacy"], summary="Reject", description="Reject a stock request.")
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

    @extend_schema(tags=["Pharmacy"], summary="Cancel", description="Cancel a stock request.")
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

    @extend_schema(tags=["Pharmacy"], summary="Update items", description="Update item quantities for a pending or approved request.")
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

    @extend_schema(tags=["Pharmacy"], summary="Fulfill", description="Fulfill a stock request.")
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
                        location_clinic=stock_request.clinic,
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

    @extend_schema(tags=["Pharmacy"], summary="Confirm receipt", description="Confirm receipt of stock.")
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


@document_viewset(tag="Pharmacy", resource="stock issues", read_only=True)
class StockIssueViewSet(ClinicScopedMixin, viewsets.ReadOnlyModelViewSet):
    """ViewSet for listing stock issues (e.g. receipts from Central Store to Dispensary)."""
    clinic_filter_field = 'request__clinic'
    queryset = StockIssue.objects.select_related('request', 'issued_by').prefetch_related('lines__medication').all()
    serializer_class = StockIssueSerializer
    pagination_class = FlexiblePageNumberPagination

    def get_queryset(self):
        qs = super().get_queryset()
        to_location = self.request.query_params.get('to_location', '').strip()
        if to_location:
            qs = qs.filter(request__to_location__icontains=to_location)
        return self.scope_queryset(qs).order_by('-issued_at')


@document_viewset(tag="Pharmacy", resource="HOD stock issues")
class HodStockIssueViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
    """Discretionary issues from the Pharmacy HOD store."""

    clinic_filter_field = 'location_clinic'
    serializer_class = HodStockIssueSerializer
    pagination_class = FlexiblePageNumberPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['medication', 'issued_by']
    search_fields = [
        'issue_id',
        'medication__name',
        'medication__generic__name',
        'patient_name',
        'patient_mrn',
        'reason',
        'notes',
    ]
    ordering_fields = ['issued_at']
    ordering = ['-issued_at']
    http_method_names = ['get', 'post', 'head', 'options']

    def _ensure_hod_access(self):
        from pharmacy.hod_store import user_can_operate_hod_store

        if not user_can_operate_hod_store(self.request.user):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "Only the Head of Pharmacy (or a superuser) can access the HOD store."
            )

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return HodStockIssue.objects.none()
        self._ensure_hod_access()
        qs = self.scope_queryset(
            HodStockIssue.objects.select_related(
                'medication', 'medication__generic', 'issued_by', 'inventory_item'
            )
        )
        date_preset = (self.request.query_params.get('date_preset') or 'all').lower()
        if date_preset != 'all':
            from common.report_period import apply_date_preset

            qs = apply_date_preset(qs, date_preset, 'issued_at')
        search = (self.request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(issue_id__icontains=search)
                | Q(medication__name__icontains=search)
                | Q(medication__generic__name__icontains=search)
                | Q(patient_name__icontains=search)
                | Q(patient_mrn__icontains=search)
                | Q(reason__icontains=search)
                | Q(notes__icontains=search)
            )
        return qs

    @extend_schema(tags=["Pharmacy"], summary="Summary stats", description="HOD issue KPIs for the current filter set.")
    @action(detail=False, methods=['get'], url_path='summary-stats')
    def summary_stats(self, request):
        qs = self.get_queryset()
        today = timezone.localdate()
        return Response({
            'total': qs.count(),
            'today': qs.filter(issued_at__date=today).count(),
            'total_quantity': str(qs.aggregate(s=Sum('quantity'))['s'] or 0),
        })

    def perform_create(self, serializer):
        from pharmacy.hod_store import HOD_STORE_LOCATION, user_can_operate_hod_store
        from accounts.utils import resolve_clinic

        self._ensure_hod_access()
        medication = serializer.validated_data['medication']
        quantity = serializer.validated_data['quantity']
        quantity_entry_mode = serializer.validated_data.get('quantity_entry_mode', '') or ''
        from pharmacy.dispense_units import validate_inventory_units

        try:
            validate_inventory_units(medication, quantity, quantity_entry_mode)
        except Exception as exc:
            from django.core.exceptions import ValidationError as DjangoValidationError
            if isinstance(exc, DjangoValidationError):
                raise ValidationError({'quantity': exc.messages})
            raise
        if quantity <= 0:
            raise ValidationError({'quantity': ['Quantity must be greater than zero.']})

        inventory_item = serializer.validated_data.get('inventory_item')
        remaining = quantity

        with transaction.atomic():
            if inventory_item is not None:
                if inventory_item.location != HOD_STORE_LOCATION:
                    raise ValidationError({'inventory_item_id': ['Batch is not in HOD store.']})
                if inventory_item.medication_id != medication.id:
                    raise ValidationError({'inventory_item_id': ['Batch medication does not match.']})
                if inventory_item.quantity < remaining:
                    raise ValidationError({'quantity': ['Insufficient stock in selected batch.']})
                inventory_item.quantity -= remaining
                inventory_item.save(update_fields=['quantity'])
                used_item = inventory_item
            else:
                batches = list(
                    MedicationInventory.objects.select_for_update()
                    .filter(
                        medication=medication,
                        location=HOD_STORE_LOCATION,
                        quantity__gt=0,
                        expiry_date__gt=timezone.now().date(),
                    )
                    .order_by('expiry_date')
                )
                if not batches:
                    raise ValidationError({'medication': ['No unexpired HOD store stock for this medication.']})
                available = sum((b.quantity for b in batches), Decimal('0'))
                if available < remaining:
                    raise ValidationError({'quantity': ['Insufficient HOD store stock.']})

                used_item = None
                for batch in batches:
                    if remaining <= 0:
                        break
                    take = min(batch.quantity, remaining)
                    batch.quantity -= take
                    batch.save(update_fields=['quantity'])
                    remaining -= take
                    if used_item is None:
                        used_item = batch

            clinic = resolve_clinic(self.request.user)
            issue = HodStockIssue.objects.create(
                medication=medication,
                inventory_item=used_item,
                quantity=quantity,
                quantity_entry_mode=quantity_entry_mode,
                unit=getattr(medication, 'unit', '') or used_item.unit,
                batch_number=used_item.batch_number if used_item else '',
                patient_name=serializer.validated_data.get('patient_name', ''),
                patient_mrn=serializer.validated_data.get('patient_mrn', ''),
                reason=serializer.validated_data.get('reason', ''),
                notes=serializer.validated_data.get('notes', ''),
                issued_by=self.request.user,
                location_clinic=clinic,
            )

        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='hod_stock_issue',
            object_id=str(issue.id),
            module='pharmacy',
            object_repr=f'HOD issue {issue.issue_id}',
            description=(
                f'Issued {issue.quantity} {issue.unit} of {medication.name} from HOD store'
            ),
            new_values={
                'medication_id': medication.id,
                'quantity': float(issue.quantity),
                'batch_number': issue.batch_number,
            },
            request=self.request,
        )
        serializer.instance = issue
