"""
Custom pagination classes for laboratory app.
"""
from rest_framework.pagination import PageNumberPagination


class FlexiblePageNumberPagination(PageNumberPagination):
    """
    Page number pagination that allows clients to override page size.
    Used for lab templates and ICD-10 codes to allow loading large datasets.
    """
    page_size = 1000  # Higher default for large datasets
    page_size_query_param = 'page_size'
    max_page_size = 10000  # Very high limit to allow loading all data

