"""
Shared mixins for DRF viewsets.
"""
from rest_framework import serializers
from organization.models import SystemConfig
from accounts.utils import resolve_clinic, resolve_clinic_id


class ClinicScopedMixin:
    """
    Mixin for DRF viewsets to scope data by the user's active clinic.

    Usage:
        class MyViewSet(ClinicScopedMixin, viewsets.ModelViewSet):
            clinic_filter_field = 'location_clinic'

            def get_queryset(self):
                qs = super().get_queryset()
                # ... custom filters ...
                return self.scope_queryset(qs)

            def perform_create(self, serializer):
                self.auto_set_clinic(serializer)
                return super().perform_create(serializer)
    """

    clinic_filter_field = 'location_clinic'

    def scope_queryset(self, qs):
        """Apply clinic filtering to a queryset when multi-clinic mode is enabled."""
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            clinic_id = resolve_clinic_id(self.request.user)
            if clinic_id is not None:
                qs = qs.filter(**{self.clinic_filter_field: clinic_id})
        return qs

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        return self.scope_queryset(qs)

    def _get_clinic_id(self, clinic_value):
        """Extract the clinic PK from either a Clinic instance or an int."""
        return clinic_value.id if hasattr(clinic_value, 'id') else clinic_value

    def _validate_clinic_access(self, clinic_value):
        """
        Validate user can create records for the given clinic.
        - Superusers: allowed for any clinic.
        - Others: must be assigned via clinics M2M (or home clinic if none assigned).
        """
        if not SystemConfig.is_enabled('multi_clinic_enabled'):
            return
        if clinic_value is None:
            return
        if self.request.user.is_superuser:
            return
        chosen_id = self._get_clinic_id(clinic_value)
        assigned = set(self.request.user.clinics.values_list('id', flat=True))
        if not assigned:
            assigned = {self.request.user.clinic_id} if self.request.user.clinic_id else set()
        if chosen_id not in assigned:
            raise serializers.ValidationError(
                {self.clinic_filter_field: ["You are not assigned to this clinic."]}
            )

    def auto_set_clinic(self, serializer):
        """
        Default location_clinic to the user's active clinic when multi-clinic is enabled
        and the client didn't supply one. If supplied, validate access.
        """
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            clinic_val = serializer.validated_data.get(self.clinic_filter_field)
            if clinic_val is None:
                clinic = resolve_clinic(self.request.user)
                if clinic is not None:
                    serializer.validated_data[self.clinic_filter_field] = clinic
            else:
                self._validate_clinic_access(clinic_val)


class LabRadiologyScopedMixin(ClinicScopedMixin):
    """
    Extension for LabOrder / RadiologyOrder viewsets.

    - List: filter by processing_clinic (lab/radiology worklist).
    - Create: auto-set both location_clinic (requesting clinic) and
      processing_clinic (defaults from requesting clinic's config).
    """

    clinic_filter_field = 'processing_clinic'

    def auto_set_clinic(self, serializer):
        if SystemConfig.is_enabled('multi_clinic_enabled'):
            location_clinic_val = serializer.validated_data.get('location_clinic')
            if location_clinic_val is None:
                clinic = resolve_clinic(self.request.user)
                if clinic is not None:
                    location_clinic_val = clinic
                    serializer.validated_data['location_clinic'] = clinic
            else:
                self._validate_clinic_access(location_clinic_val)

            location_clinic_id = self._get_clinic_id(location_clinic_val) if location_clinic_val else None

            # processing_clinic defaults from the location clinic's config
            if 'processing_clinic' not in serializer.validated_data and location_clinic_id is not None:
                from organization.models import Clinic
                try:
                    clinic_obj = Clinic.objects.get(id=location_clinic_id)
                except Clinic.DoesNotExist:
                    clinic_obj = None
                if clinic_obj:
                    processing = clinic_obj.default_processing_clinic or clinic_obj
                    serializer.validated_data['processing_clinic'] = processing
