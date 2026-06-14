"""
Laboratory pagination classes.
"""
from common.pagination import CatalogPageNumberPagination, StandardPageNumberPagination


class FlexiblePageNumberPagination(StandardPageNumberPagination):
    """Lab operational lists — same defaults as the global standard."""


class LabCatalogPagination(CatalogPageNumberPagination):
    """Lab templates / reference data."""

