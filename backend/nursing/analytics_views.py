"""Nursing module analytics API."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.analytics_export import maybe_export_analytics
from common.module_analytics import parse_analytics_dates
from common.openapi import document_api_view
from .analytics import build_nursing_analytics


@document_api_view(tag="Analytics", summary="Nursing analytics summary")
class NursingAnalyticsSummaryView(APIView):
    """
    GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
    Nursing orders and procedures scoped by ordered_at.
    """

    def get(self, request):
        parsed = parse_analytics_dates(request)
        if isinstance(parsed, Response):
            return parsed
        start_dt, end_dt, _all_time = parsed

        analytics_data = build_nursing_analytics(start_dt, end_dt)

        exported = maybe_export_analytics(request, analytics_data, module_key="nursing")
        if exported is not None:
            return exported
        return Response(analytics_data)