"""
Views for the Notifications app.
"""
import logging

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter
from django.core.cache import cache
from django.utils import timezone

from .models import Notification, NotificationPreferences
from .serializers import NotificationSerializer, NotificationPreferencesSerializer
from permissions.drf_permissions import ApiPageAccessPermission
from .permissions import CanManageNotificationRouting
from .routing_matrix import (
    clear_routing_matrix_override,
    get_routing_matrix,
    routing_matrix_has_override,
    set_routing_matrix_override,
    ROLE_DEPARTMENT_HINTS,
)
from common.openapi import document_api_view, document_viewset
from drf_spectacular.utils import extend_schema, extend_schema_view
from common.openapi import GENERIC_JSON_REQUEST, JSON_MUTATION_RESPONSES, JSON_OBJECT_RESPONSE

logger = logging.getLogger(__name__)

# Self-trigger cadence for the auto-archive sweep — invoked on the
# *first* notifications list-fetch each day across all users in the
# process. Cache-gated so concurrent requests don't all run it.
_AUTO_ARCHIVE_CACHE_KEY = "notifications:last_auto_archive_at"
_AUTO_ARCHIVE_LOCK_KEY = "notifications:auto_archive_running"
_AUTO_ARCHIVE_INTERVAL_SECS = 24 * 60 * 60  # 24h


@document_viewset(tag="Notifications", resource="notifications")
class NotificationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing notifications."""
    serializer_class = NotificationSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['notification_type', 'priority', 'status']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Notification.objects.none()
        
        """Return only current user's notifications.

        Side-effect: kick off the auto-archive sweep at most once every
        24h. Wrapped in a try/except because cleanup must never break
        the listing endpoint, and gated by a short lock so the
        thundering-herd of an end-of-day refresh doesn't run it
        multiple times.
        """
        self._maybe_run_auto_archive()
        return Notification.objects.filter(user=self.request.user)

    @classmethod
    def _maybe_run_auto_archive(cls):
        last = cache.get(_AUTO_ARCHIVE_CACHE_KEY)
        if last is not None:
            return
        # Acquire a short lock so concurrent workers don't all try to
        # run the sweep. 30s is plenty for an UPDATE on a few thousand
        # rows.
        got_lock = cache.add(_AUTO_ARCHIVE_LOCK_KEY, "1", timeout=30)
        if not got_lock:
            return
        try:
            # Import lazily to avoid management-command import overhead
            # on every viewset module load.
            from .management.commands.cleanup_notifications import (
                archive_old_read_notifications,
            )
            archived = archive_old_read_notifications()
            cache.set(_AUTO_ARCHIVE_CACHE_KEY, timezone.now().isoformat(),
                      timeout=_AUTO_ARCHIVE_INTERVAL_SECS)
            if archived:
                logger.info("auto-archive: %d notifications archived", archived)
        except Exception:
            logger.exception("auto-archive sweep failed (non-fatal)")
        finally:
            cache.delete(_AUTO_ARCHIVE_LOCK_KEY)
    
    @extend_schema(tags=["Notifications"], summary="Mark read", description="Mark notification as read.")
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark notification as read."""
        notification = self.get_object()
        notification.mark_as_read()
        return Response(NotificationSerializer(notification).data)
    
    @extend_schema(tags=["Notifications"], summary="Mark all read", description="Mark all notifications as read.")
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Mark all notifications as read."""
        count = Notification.objects.filter(
            user=request.user,
            status='unread'
        ).update(status='read', read_at=timezone.now())
        return Response({'message': f'{count} notifications marked as read'})
    
    @extend_schema(tags=["Notifications"], summary="Archive", description="Archive a notification.")
    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Archive a notification."""
        notification = self.get_object()
        notification.status = 'archived'
        notification.save()
        return Response(NotificationSerializer(notification).data)
    
    @extend_schema(tags=["Notifications"], summary="Unread count", description="Get unread notification count.")
    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get unread notification count."""
        count = Notification.objects.filter(
            user=request.user,
            status='unread'
        ).count()
        return Response({'count': count})


@document_viewset(tag="Notifications", resource="notification preferences")
class NotificationPreferencesViewSet(viewsets.ModelViewSet):
    """ViewSet for managing notification preferences.

    Each user has at most one row; the viewset behaves as a singleton:
    ``GET /preferences/`` lists the user's single row (auto-creating
    defaults if it doesn't exist), and ``PATCH /preferences/<id>/``
    updates it. ``user`` is enforced server-side and never trusted from
    the request body.
    """
    serializer_class = NotificationPreferencesSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return NotificationPreferences.objects.none()

        # Auto-create the singleton on first read so the frontend can
        # PATCH it without an explicit POST step.
        NotificationPreferences.objects.get_or_create(user=self.request.user)
        return NotificationPreferences.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        # If a client POSTs preferences, force the row to belong to the
        # current user regardless of payload.
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        serializer.save(user=self.request.user)


@extend_schema_view(
    get=extend_schema(
        summary="Get notification routing matrix",
        tags=["Notifications"],
        responses=JSON_OBJECT_RESPONSE,
    ),
    patch=extend_schema(
        summary="Update notification routing matrix override",
        tags=["Notifications"],
        request=GENERIC_JSON_REQUEST,
        responses=JSON_MUTATION_RESPONSES,
    ),
    delete=extend_schema(
        summary="Clear notification routing matrix override",
        tags=["Notifications"],
        responses={204: None},
    ),
)
class NotificationRoutingMatrixView(APIView):
    """
    Admin: inspect and update the notification audience routing matrix.

    GET returns defaults, optional cache overlay flag, and the effective
    merged matrix used by ``notify_role``. PATCH stores a partial or full
    overlay in cache; DELETE removes the overlay (file defaults only).
    """

    permission_classes = [IsAuthenticated, ApiPageAccessPermission, CanManageNotificationRouting]

    def get(self, request):
        return Response(
            {
                "source": "override" if routing_matrix_has_override() else "default",
                "defaults": dict(ROLE_DEPARTMENT_HINTS),
                "matrix": get_routing_matrix(),
                "description": (
                    "When ``notify_role`` runs without an explicit department_id, "
                    "recipients are filtered by system role plus these department "
                    "code/name hints (and clinic_id when provided by the caller)."
                ),
            }
        )

    def patch(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        matrix = body.get("matrix")
        if matrix is None:
            return Response(
                {"detail": "Expected JSON body with a `matrix` object."},
                status=400,
            )
        if not isinstance(matrix, dict):
            return Response({"detail": "`matrix` must be an object."}, status=400)
        effective = set_routing_matrix_override(matrix)
        return Response(
            {
                "source": "override" if routing_matrix_has_override() else "default",
                "matrix": effective,
            }
        )

    def delete(self, request):
        clear_routing_matrix_override()
        return Response(
            {
                "source": "default",
                "matrix": get_routing_matrix(),
            }
        )

