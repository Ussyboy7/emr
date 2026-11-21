"""Clinic-to-clinic processing policy for laboratory and radiology routing."""

from rest_framework.exceptions import PermissionDenied

from permissions.user_capabilities import user_has_capability


def required_processing_clinic(origin):
    """Return the configured internal destination for an origin clinic."""
    if not origin or not origin.default_processing_clinic_id:
        return None
    return origin.default_processing_clinic


def ensure_internal_processing_destination(origin, destination):
    """Enforce the origin clinic's configured internal destination."""
    required = required_processing_clinic(origin)
    if required is None:
        raise PermissionDenied(
            "This clinic processes internally and cannot reroute to another internal clinic."
        )
    if destination is None or destination.pk != required.pk:
        raise PermissionDenied(
            f"This clinic must route internal processing to {required.name}."
        )


def ensure_internal_routing_destination(user, origin, destination):
    """Authorise an internal routing destination for a lab test or study line.

    A known origin pins the destination to that clinic's own policy. An order
    with no resolvable origin has no such policy, so its triage may pick one of
    the user's assigned facilities or a designated processing hub (a clinic
    that other clinics route to, e.g. Bode Thomas).
    """
    if origin is not None:
        ensure_internal_processing_destination(origin, destination)
        return
    if destination is None:
        return
    if user.is_superuser or user_has_capability(user, 'clinical_data_view_all'):
        return
    assigned = set(user.location_clinics.values_list('id', flat=True))
    if not assigned and user.location_clinic_id:
        assigned = {user.location_clinic_id}
    if destination.pk in assigned or destination.clinics_that_route_here.exists():
        return
    raise PermissionDenied(
        'Orders without an origin can only be routed to your assigned '
        'facilities or a designated processing clinic.'
    )
