"""
Eyecare views.
"""
from rest_framework.response import Response
from rest_framework.views import APIView

from common.analytics_export import maybe_export_analytics
from common.module_analytics import parse_analytics_dates
from common.openapi import document_api_view
from permissions.drf_permissions import AuthenticatedWithPageAccess

from .analytics import build_eyecare_analytics


@document_api_view(tag="Analytics", summary="Eyecare analytics summary")
class EyecareAnalyticsSummaryView(APIView):
    """GET ?start=YYYY-MM-DD&end=YYYY-MM-DD — eye clinic activity in range."""

    permission_classes = AuthenticatedWithPageAccess

    def get(self, request):
        parsed = parse_analytics_dates(request)
        if isinstance(parsed, Response):
            return parsed
        start_date, end_date, _all_time = parsed
        analytics_data = build_eyecare_analytics(start_date, end_date)
        exported = maybe_export_analytics(request, analytics_data, module_key="eyecare")
        if exported is not None:
            return exported
        return Response(analytics_data)
