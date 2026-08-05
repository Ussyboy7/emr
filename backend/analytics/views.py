"""
Analytics views for the main clinical dashboard.
"""
from rest_framework import views
from rest_framework.response import Response

from common.analytics_export import maybe_export_analytics
from common.module_analytics import parse_analytics_dates
from common.openapi import JSON_OBJECT_RESPONSE, document_api_view
from permissions.drf_permissions import AuthenticatedWithPageAccess

from .clinical_dashboard import build_clinical_dashboard


@document_api_view(tag="Analytics", summary="Clinical dashboard analytics", responses=JSON_OBJECT_RESPONSE)
class ClinicalDashboardAnalyticsView(views.APIView):
    """Comprehensive clinical dashboard analytics for the selected period."""

    permission_classes = AuthenticatedWithPageAccess

    def get(self, request):
        from common.mixins import resolve_facility_scope

        parsed = parse_analytics_dates(request)
        if isinstance(parsed, Response):
            return parsed

        start_dt, end_dt, all_time = parsed
        clinic_scope = resolve_facility_scope(request)
        data = build_clinical_dashboard(
            start_dt, end_dt, all_time=all_time, clinic_scope=clinic_scope
        )

        exported = maybe_export_analytics(request, data, module_key="clinical")
        if exported is not None:
            return exported
        return Response(data)
