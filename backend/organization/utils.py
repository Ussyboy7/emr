"""Helpers for organization.Clinic (facility) resolution."""


def resolve_facility_from_location_value(location_value):
    """
    Match facility (Clinic) from patient/visit location string.
    Accepts numeric primary key or facility name (case-insensitive).
    """
    if location_value is None:
        return None
    s = str(location_value).strip()
    if not s:
        return None
    from .models import Clinic

    if s.isdigit():
        return Clinic.objects.filter(pk=int(s, 10), is_active=True).first()
    return Clinic.objects.filter(name__iexact=s, is_active=True).first()
