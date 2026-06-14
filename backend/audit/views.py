"""
Views for the Audit app.
"""
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from common.openapi import document_viewset
from drf_spectacular.utils import extend_schema
from django.utils import timezone
from datetime import timedelta

from .models import ActivityLog
from .serializers import ActivityLogSerializer


@document_viewset(tag="Audit", resource="activity logs", read_only=True)
class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing audit logs."""
    
    serializer_class = ActivityLogSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['user', 'action', 'object_type', 'module', 'severity', 'result']
    search_fields = ['description', 'object_repr', 'user__username', 'user__email']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ActivityLog.objects.none()
        
        """Filter logs based on user permissions."""
        queryset = ActivityLog.objects.all().select_related('user')
        
        # Non-superusers can only see their own logs
        if not self.request.user.is_superuser:
            queryset = queryset.filter(user=self.request.user)
        
        # Date range filtering
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        if date_from:
            try:
                from django.utils.dateparse import parse_datetime
                from django.utils import timezone as tz
                date_from_obj = parse_datetime(date_from)
                if date_from_obj:
                    # Make timezone-aware if not already
                    if tz.is_naive(date_from_obj):
                        date_from_obj = tz.make_aware(date_from_obj)
                    queryset = queryset.filter(created_at__gte=date_from_obj)
            except (ValueError, AttributeError, TypeError):
                pass
        
        if date_to:
            try:
                from django.utils.dateparse import parse_datetime
                from django.utils import timezone as tz
                date_to_obj = parse_datetime(date_to)
                if date_to_obj:
                    # Make timezone-aware if not already
                    if tz.is_naive(date_to_obj):
                        date_to_obj = tz.make_aware(date_to_obj)
                    # Include the entire day
                    date_to_obj = date_to_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
                    queryset = queryset.filter(created_at__lte=date_to_obj)
            except (ValueError, AttributeError, TypeError):
                pass
        elif self.action == "list" and not date_from:
            # Cap unbounded list scans at 90 days by default.
            queryset = queryset.filter(created_at__gte=timezone.now() - timedelta(days=90))
        
        return queryset
    
    @extend_schema(tags=["Audit"], summary="Audit log statistics")
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get audit statistics."""
        queryset = self.get_queryset()
        
        # Filter by date range if provided
        days = int(request.query_params.get('days', 30))
        since = timezone.now() - timedelta(days=days)
        queryset = queryset.filter(created_at__gte=since)
        
        stats = {
            'total_actions': queryset.count(),
            'by_action': {},
            'by_module': {},
            'by_severity': {},
            'by_result': {},
            'recent_activity': ActivityLogSerializer(
                queryset[:10],
                many=True
            ).data,
        }
        
        # Count by action
        for action, _ in ActivityLog.ACTION_CHOICES:
            count = queryset.filter(action=action).count()
            if count > 0:
                stats['by_action'][action] = count
        
        # Count by module
        modules = queryset.values_list('module', flat=True).distinct()
        for module in modules:
            stats['by_module'][module] = queryset.filter(module=module).count()
        
        # Count by severity
        for severity, _ in ActivityLog.SEVERITY_CHOICES:
            count = queryset.filter(severity=severity).count()
            if count > 0:
                stats['by_severity'][severity] = count
        
        # Count by result
        for result, _ in ActivityLog.RESULT_CHOICES:
            count = queryset.filter(result=result).count()
            if count > 0:
                stats['by_result'][result] = count
        
        return Response(stats)

    @extend_schema(tags=["Audit"], summary="Distinct audit log modules")
    @action(detail=False, methods=["get"], url_path="modules")
    def modules(self, request):
        """
        List distinct module keys present in the audit log queryset.

        Respects the same permission scoping as the list endpoint.
        """
        qs = self.get_queryset()
        modules = (
            qs.exclude(module__isnull=True)
            .exclude(module__exact="")
            .values_list("module", flat=True)
            .distinct()
            .order_by("module")
        )
        return Response({"results": list(modules)})

