"""Shared helpers for lab/radiology (and similar) catalog viewsets."""

from __future__ import annotations

from django.db.models import Count, QuerySet
from rest_framework import status
from rest_framework.response import Response


def build_catalog_list_stats(queryset: QuerySet, categories: list[str]) -> dict:
    """Return total/active counts plus per-category breakdown."""
    by_cat = {
        row['category']: row['count']
        for row in queryset.values('category').annotate(count=Count('id'))
    }
    return {
        'total': queryset.count(),
        'active': queryset.filter(is_active=True).count(),
        **{cat: by_cat.get(cat, 0) for cat in categories},
    }


def resolve_catalog_template_by_code(queryset: QuerySet, code: str, serializer):
    """Resolve a single catalog template by exact code (case-insensitive)."""
    normalized = (code or '').strip()
    if not normalized:
        return None, Response({'detail': 'code is required'}, status=status.HTTP_400_BAD_REQUEST)
    template = queryset.filter(code__iexact=normalized).first()
    if not template:
        return None, Response({'detail': 'Template not found'}, status=status.HTTP_404_NOT_FOUND)
    return serializer(template).data, None
