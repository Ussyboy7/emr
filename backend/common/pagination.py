"""
Shared pagination utilities.

We standardize on `page_size` query param across the API because the frontend
passes `page_size` widely (e.g. `?page=1&page_size=50`).
"""

from rest_framework.pagination import PageNumberPagination


class StandardPageNumberPagination(PageNumberPagination):
    """
    Operational lists — default 50 rows, max 100 per request.
    """

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 100


class CatalogPageNumberPagination(PageNumberPagination):
    """
    Reference catalogs (ICD-10 search, lab/rad templates).

    Clients should use server-side search with modest page sizes; max 500 is a
    safety ceiling for admin template grids, not for bulk export.
    """

    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500
