"""
Pharmacy pagination classes.
"""
from common.pagination import CatalogPageNumberPagination, StandardPageNumberPagination


class FlexiblePageNumberPagination(StandardPageNumberPagination):
    """Pharmacy operational lists — same defaults as the global standard."""


class PharmacyCatalogPagination(CatalogPageNumberPagination):
    """Pharmacy catalog / reference data."""

