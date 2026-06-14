"""Canonical location_clinic FK resolution (write) and display (read)."""

from __future__ import annotations


def location_clinic_name(obj) -> str | None:
    """Display name from a model's location_clinic FK."""
    if obj is None:
        return None
    clinic = getattr(obj, "location_clinic", None)
    return clinic.name if clinic is not None else None


def order_location_clinic_name(order) -> str | None:
    """
    Display name for order-like records: own location_clinic FK, then
    linked consultation_session / visit location_clinic FKs.
    """
    if order is None:
        return None
    name = location_clinic_name(order)
    if name:
        return name
    session = getattr(order, "consultation_session", None)
    if session is not None:
        name = location_clinic_name(session)
        if name:
            return name
    visit = getattr(order, "visit", None)
    return location_clinic_name(visit)


def ward_clinic_name(admission) -> str | None:
    """Display name from admission.ward.clinic FK."""
    if admission is None:
        return None
    ward = getattr(admission, "ward", None)
    if ward is None:
        return None
    clinic = getattr(ward, "clinic", None)
    return clinic.name if clinic is not None else None


def resolve_order_location_clinic(*, visit=None, session=None, user=None):
    """
    Resolve requesting clinic FK when creating orders.

    Priority: consultation session → session room → visit FK → user active clinic.
    """
    if session is not None:
        loc = getattr(session, "location_clinic", None)
        if loc is not None:
            return loc
        room = getattr(session, "room", None)
        if room is not None:
            room_clinic = getattr(room, "clinic", None)
            if room_clinic is not None:
                return room_clinic

    if visit is not None:
        loc = getattr(visit, "location_clinic", None)
        if loc is not None:
            return loc

    if user is not None:
        from accounts.utils import resolve_clinic

        clinic = resolve_clinic(user)
        if clinic is not None:
            return clinic

    return None


def apply_order_location_clinic(validated_data: dict, *, user=None) -> dict:
    """Set location_clinic on validated order data when omitted."""
    if validated_data.get("location_clinic"):
        return validated_data
    clinic = resolve_order_location_clinic(
        visit=validated_data.get("visit"),
        session=validated_data.get("consultation_session"),
        user=user,
    )
    if clinic is not None:
        validated_data = {**validated_data, "location_clinic": clinic}
    return validated_data
