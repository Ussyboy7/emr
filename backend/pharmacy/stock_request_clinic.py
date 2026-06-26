"""Stamp and repair requesting clinic on stock requests."""
from __future__ import annotations


def repair_stock_request_clinic(stock_request, *, persist: bool = True):
    """
    Ensure stock_request.clinic is set from the requester's profile.

    Returns the (possibly updated) instance. When persist=True, saves null-clinic rows.
    """
    if stock_request.clinic_id or not stock_request.requested_by_id:
        return stock_request

    from accounts.utils import resolve_clinic

    requester = stock_request.requested_by
    clinic = resolve_clinic(requester)
    if clinic is None:
        return stock_request

    if persist:
        from pharmacy.models import StockRequest

        StockRequest.objects.filter(pk=stock_request.pk, clinic__isnull=True).update(clinic_id=clinic.id)

    stock_request.clinic_id = clinic.id
    stock_request.clinic = clinic
    return stock_request
