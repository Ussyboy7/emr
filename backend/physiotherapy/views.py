"""
Physiotherapy views.
"""
from rest_framework.response import Response
from rest_framework.views import APIView

from common.analytics_export import maybe_export_analytics
from common.module_analytics import parse_analytics_dates
from common.openapi import document_api_view

from .analytics import build_physiotherapy_analytics
from .models import PhysioOrder, PhysioSession


@document_api_view(tag="Analytics", summary="Physiotherapy analytics summary")
class PhysiotherapyAnalyticsSummaryView(APIView):
    """GET ?start=YYYY-MM-DD&end=YYYY-MM-DD — orders and sessions in range."""

    def get(self, request):
        parsed = parse_analytics_dates(request)
        if isinstance(parsed, Response):
            return parsed
        start_date, end_date, _all_time = parsed
        analytics_data = build_physiotherapy_analytics(start_date, end_date)
        exported = maybe_export_analytics(request, analytics_data, module_key="physiotherapy")
        if exported is not None:
            return exported
        return Response(analytics_data)


@document_api_view(tag="Physiotherapy", summary="Physiotherapy queue counters")
class PhysiotherapyStatsView(APIView):
    """Basic physiotherapy order and session counts."""

    def get(self, request):
        return Response({
            'total_orders': PhysioOrder.objects.count(),
            'pending_orders': PhysioOrder.objects.filter(status__in=['pending', 'scheduled']).count(),
            'completed_sessions': PhysioSession.objects.filter(status='completed').count(),
            'active_sessions': PhysioSession.objects.filter(status='in_progress').count(),
            'total_sessions': PhysioSession.objects.count(),
        })
