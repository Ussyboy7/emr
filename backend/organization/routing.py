"""Clinic-to-clinic processing policy for laboratory and radiology routing."""

from rest_framework.exceptions import PermissionDenied


def required_processing_clinic(origin):
    """Return the configured internal destination for an origin clinic."""
    if not origin or not origin.default_processing_clinic_id:
        return None
    return origin.default_processing_clinic


def ensure_internal_processing_destination(origin, destination):
    """Enforce the clinic's configured internal processing destination."""
    required = required_processing_clinic(origin)
    if required is None:
        raise PermissionDenied(
            "This clinic processes internally and cannot reroute to another internal clinic."
        )
    if destination is None or destination.pk != required.pk:
        raise PermissionDenied(
            f"This clinic must route internal processing to {required.name}."
        )
