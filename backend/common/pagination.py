"""
Shared pagination utilities.

We standardize on `page_size` query param across the API because the frontend
passes `page_size` widely (e.g. `?page=1&page_size=500`).
"""

from rest_framework.pagination import PageNumberPagination


class StandardPageNumberPagination(PageNumberPagination):
    """
    Page-number pagination that allows clients to override page size.

    - Query params:
      - `page`
      - `page_size`
    """

    page_size_query_param = "page_size"
    max_page_size = 5000

