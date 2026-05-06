"""Nursing module analytics API."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.module_analytics import parse_analytics_dates
from .analytics import build_nursing_analytics


class NursingAnalyticsSummaryView(APIView):
    """
    GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
    Nursing orders and procedures scoped by ordered_at.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        parsed = parse_analytics_dates(request)
        if isinstance(parsed, Response):
            return parsed
        start_dt, end_dt = parsed

        analytics_data = build_nursing_analytics(start_dt, end_dt)

        return Response(analytics_data)