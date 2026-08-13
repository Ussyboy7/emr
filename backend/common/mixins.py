"""
Shared mixins for DRF viewsets.

Terminology: a "facility" is a physical site (HQ, Bode Thomas, Apapa —
`organization.Clinic`). This is the security/operational boundary. It must NOT
be confused with `OutpatientClinicType` (GOPD, Eye, Physio), which is a clinic
*type* — a workflow/filter dimension, not a boundary. The underlying DB columns
themselves are still named `location_clinic_id` / `processing_clinic_id` for
backward compatibility; treat them as facility FKs.
"""
from django.shortcuts import get_object_or_404
from django.db.models import Q
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from accounts.utils import resolve_facility, resolve_facility_id
from organization.models import Clinic, SystemConfig

# Sentinel returned by ``resolve_facility_scope`` when the caller explicitly asks
# for every facility's data (``?clinic_id=all`` or ``?scope=all``).
SCOPE_ALL = "__ALL__"

# Query-param alias accepted for an explicit "all facilities" request.
ALL_SCOPE_PARAMS = {"all", "*"}


def _can_view_all_facilities(user) -> bool:
    """Leadership/superuser gate for cross-facility (``scope=all``) reads."""
    if getattr(user, "is_superuser", False):
        return True
    if getattr(user, "is_management", False):
        return True
    try:
        from permissions.user_capabilities import user_has_capability

        return user_has_capability(user, "clinical_data_view_all")
    except Exception:
        return False


def resolve_facility_scope(request):
    """
    Resolve the effective facility scope for a request.

    Returns:
        - ``Clinic`` instance (a facility): scope to this facility.
        - ``SCOPE_ALL``: all facilities (requires ``?clinic_id=all`` /
          ``?scope=all`` and the ``clinical_data_view_all`` capability).
        - ``None``: no scoping (multi-clinic disabled, or session facility absent).

    Raises ``PermissionDenied`` when an all-facility scope is requested without
    the capability. Used by ``FacilityScopedMixin`` and plain ``APIView`` handlers.
    """
    if not SystemConfig.is_enabled("multi_clinic_enabled"):
        return None

    requested = request.query_params.get("clinic_id") or request.query_params.get("scope")
    if requested in ALL_SCOPE_PARAMS:
        if not _can_view_all_facilities(request.user):
            raise PermissionDenied("You are not allowed to view all facilities.")
        return SCOPE_ALL
    if requested:
        clinic = get_object_or_404(Clinic, pk=requested)
        if not getattr(request.user, "is_superuser", False) and not _can_view_all_facilities(request.user):
            assigned = set(request.user.location_clinics.values_list("id", flat=True))
            if not assigned and request.user.location_clinic_id:
                assigned = {request.user.location_clinic_id}
            if clinic.pk not in assigned:
                raise PermissionDenied("You are not assigned to this facility.")
        return clinic

    # Cleared facility selection (active_clinic null) on an aggregate-capable
    # user switches the session to an all-facilities view.
    if getattr(request.user, "active_clinic", None) is None and _can_view_all_facilities(request.user):
        return SCOPE_ALL

    return resolve_facility(request.user)


def scope_query_by_facility(qs, request, field="location_clinic_id"):
    """
    Scope a queryset by the request's facility scope (query param or session).

    Use in plain ``APIView`` handlers that aren't backed by ``FacilityScopedMixin``::

        qs = scope_query_by_facility(LabOrder.objects.all(), request)
    """
    scope = resolve_facility_scope(request)
    if scope is None or scope == SCOPE_ALL:
        return qs
    return qs.filter(**{field: scope})


class FacilityScopedMixin:
    """
    Mixin for DRF viewsets to scope data by the user's active facility.

    Usage:
        class MyViewSet(FacilityScopedMixin, viewsets.ModelViewSet):
            facility_filter_field = 'location_clinic'

            def get_queryset(self):
                qs = super().get_queryset()
                # ... custom filters ...
                return self.scope_queryset(qs)

            def perform_create(self, serializer):
                self.auto_set_facility(serializer)
                return super().perform_create(serializer)

    The mixin also honours explicit ``?clinic_id=<pk>`` / ``?clinic_id=all``
    (alias ``?scope=all``) query params. ``clinic_id=all`` requires the
    ``clinical_data_view_all`` capability.
    """

    facility_filter_field = 'location_clinic'
    facility_scope_fields = None

    def scope_queryset(self, qs):
        """Apply facility filtering to a queryset from query param or session scope."""
        scope = resolve_facility_scope(self.request)
        if scope is None or scope == SCOPE_ALL:
            return qs
        if self.facility_scope_fields:
            facility_filter = Q(**{self.facility_scope_fields[0]: scope})
            for field in self.facility_scope_fields[1:]:
                facility_filter |= Q(**{field: scope})
            requested_processing = self.request.query_params.get('processing_clinic')
            if requested_processing:
                try:
                    requested_id = int(requested_processing)
                except (TypeError, ValueError):
                    raise PermissionDenied('Invalid processing facility.')
                if not _can_view_all_facilities(self.request.user):
                    assigned = set(self.request.user.location_clinics.values_list('id', flat=True))
                    if not assigned and self.request.user.location_clinic_id:
                        assigned = {self.request.user.location_clinic_id}
                    if requested_id not in assigned:
                        raise PermissionDenied('You are not assigned to this facility.')
                for field in self.facility_scope_fields:
                    facility_filter |= Q(**{field: requested_id})
            if getattr(self, 'include_unassigned_scope', False):
                null_fields = [field for field in self.facility_scope_fields if field.endswith('location_clinic') or field.endswith('processing_clinic')]
                if len(null_fields) >= 2:
                    facility_filter |= Q(**{f'{null_fields[0]}__isnull': True, f'{null_fields[1]}__isnull': True})
            return qs.filter(facility_filter).distinct()
        return qs.filter(**{self.facility_filter_field: scope})

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        return self.scope_queryset(qs)

    def _get_facility_id(self, facility_value):
        """Extract the facility PK from either a Clinic instance or an int."""
        return facility_value.id if hasattr(facility_value, 'id') else facility_value

    def _validate_facility_access(self, facility_value):
        """
        Validate user can create records for the given facility.
        - Superusers: allowed for any facility.
        - Others: must be assigned via clinics M2M (or home clinic if none assigned).
        """
        if not SystemConfig.is_enabled('multi_clinic_enabled'):
            return
        if facility_value is None:
            return
        if self.request.user.is_superuser:
            return
        chosen_id = self._get_facility_id(facility_value)
        assigned = set(self.request.user.location_clinics.values_list('id', flat=True))
        if not assigned:
            assigned = {self.request.user.location_clinic_id} if self.request.user.location_clinic_id else set()
        if chosen_id not in assigned:
            raise serializers.ValidationError(
                {self.facility_filter_field: ["You are not assigned to this facility."]}
            )

    def auto_set_facility(self, serializer):
        """
        Default location_clinic (the facility FK) to the user's active facility
        when multi-clinic is enabled and the client didn't supply one. If supplied,
        validate access.
        """
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            facility_val = serializer.validated_data.get(self.facility_filter_field)
            if facility_val is None:
                facility = resolve_facility(self.request.user)
                if facility is not None:
                    serializer.validated_data[self.facility_filter_field] = facility
            else:
                self._validate_facility_access(facility_val)


class LabRadiologyScopedMixin(FacilityScopedMixin):
    """
    Extension for LabOrder / RadiologyOrder viewsets.

    - List: filter by processing_clinic (lab/radiology worklist).
    - Create: auto-set both location_clinic (requesting facility) and
      processing_clinic (defaults from requesting facility's config).
    """

    facility_filter_field = 'processing_clinic'
    include_unassigned_scope = False

    def scope_queryset(self, qs):
        scope = resolve_facility_scope(self.request)
        if scope is None or scope == SCOPE_ALL:
            return qs
        if self.facility_scope_fields:
            facility_filter = Q(**{self.facility_scope_fields[0]: scope})
            for field in self.facility_scope_fields[1:]:
                facility_filter |= Q(**{field: scope})
            requested_processing = self.request.query_params.get('processing_clinic')
            if requested_processing:
                try:
                    requested_id = int(requested_processing)
                except (TypeError, ValueError):
                    raise PermissionDenied('Invalid processing facility.')
                if not _can_view_all_facilities(self.request.user):
                    assigned = set(self.request.user.location_clinics.values_list('id', flat=True))
                    if not assigned and self.request.user.location_clinic_id:
                        assigned = {self.request.user.location_clinic_id}
                    if requested_id not in assigned:
                        raise PermissionDenied('You are not assigned to this facility.')
                for field in self.facility_scope_fields:
                    facility_filter |= Q(**{field: requested_id})
            if self.include_unassigned_scope:
                facility_filter |= Q(
                    **{
                        f'{self.facility_scope_fields[0]}__isnull': True,
                        f'{self.facility_scope_fields[1]}__isnull': True,
                    }
                )
            return qs.filter(facility_filter).distinct()
        if self.facility_filter_field == 'processing_clinic':
            facility_filter = (
                Q(location_clinic=scope)
                | Q(processing_clinic=scope)
                | Q(tests__processing_clinic=scope)
                | Q(studies__processing_clinic=scope)
            )
            if getattr(self, 'include_unassigned_scope', False):
                facility_filter |= Q(location_clinic__isnull=True, processing_clinic__isnull=True)
            return qs.filter(facility_filter).distinct()
        if self.facility_filter_field == 'order__processing_clinic':
            facility_filter = (
                Q(order__location_clinic=scope)
                | Q(order__processing_clinic=scope)
                | Q(processing_clinic=scope)
            )
            if getattr(self, 'include_unassigned_scope', False):
                facility_filter |= Q(order__location_clinic__isnull=True, order__processing_clinic__isnull=True)
            return qs.filter(facility_filter).distinct()
        return super().scope_queryset(qs)

    def auto_set_facility(self, serializer):
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            location_clinic_val = serializer.validated_data.get('location_clinic')
            if location_clinic_val is None:
                from common.order_location import resolve_order_origin_clinic

                session = serializer.validated_data.get('consultation_session')
                visit = serializer.validated_data.get('visit')
                if visit is None and session is not None:
                    visit = getattr(session, 'visit', None)
                location_clinic_val = resolve_order_origin_clinic(
                    visit=visit,
                    session=session,
                    user=None,
                )
                if location_clinic_val is not None:
                    self._validate_facility_access(location_clinic_val)
                    serializer.validated_data['location_clinic'] = location_clinic_val
            else:
                self._validate_facility_access(location_clinic_val)

            location_clinic_id = self._get_facility_id(location_clinic_val) if location_clinic_val else None

            # processing_clinic defaults from the location (requesting) facility's config
            if serializer.validated_data.get('processing_clinic') is None and location_clinic_id is not None:
                from organization.models import Clinic
                try:
                    clinic_obj = Clinic.objects.get(id=location_clinic_id)
                except Clinic.DoesNotExist:
                    clinic_obj = None
                if clinic_obj:
                    processing = clinic_obj.default_processing_clinic or clinic_obj
                    serializer.validated_data['processing_clinic'] = processing
