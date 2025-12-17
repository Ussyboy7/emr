"""
Custom pagination classes for pharmacy app.
"""
from rest_framework.pagination import PageNumberPagination


class FlexiblePageNumberPagination(PageNumberPagination):
    """
    Page number pagination that allows clients to override page size.
    """
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 1000

