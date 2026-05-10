"""
Views for the Notifications app.
"""
import logging

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter
from django.core.cache import cache
from django.utils import timezone

from .models import Notification, NotificationPreferences
from .serializers import NotificationSerializer, NotificationPreferencesSerializer

logger = logging.getLogger(__name__)

# Self-trigger cadence for the auto-archive sweep — invoked on the
# *first* notifications list-fetch each day across all users in the
# process. Cache-gated so concurrent requests don't all run it.
_AUTO_ARCHIVE_CACHE_KEY = "notifications:last_auto_archive_at"
_AUTO_ARCHIVE_LOCK_KEY = "notifications:auto_archive_running"
_AUTO_ARCHIVE_INTERVAL_SECS = 24 * 60 * 60  # 24h


class NotificationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing notifications."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['notification_type', 'priority', 'status']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
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
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark notification as read."""
        notification = self.get_object()
        notification.mark_as_read()
        return Response(NotificationSerializer(notification).data)
    
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Mark all notifications as read."""
        count = Notification.objects.filter(
            user=request.user,
            status='unread'
        ).update(status='read', read_at=timezone.now())
        return Response({'message': f'{count} notifications marked as read'})
    
    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Archive a notification."""
        notification = self.get_object()
        notification.status = 'archived'
        notification.save()
        return Response(NotificationSerializer(notification).data)
    
    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get unread notification count."""
        count = Notification.objects.filter(
            user=request.user,
            status='unread'
        ).count()
        return Response({'count': count})


class NotificationPreferencesViewSet(viewsets.ModelViewSet):
    """ViewSet for managing notification preferences.

    Each user has at most one row; the viewset behaves as a singleton:
    ``GET /preferences/`` lists the user's single row (auto-creating
    defaults if it doesn't exist), and ``PATCH /preferences/<id>/``
    updates it. ``user`` is enforced server-side and never trusted from
    the request body.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationPreferencesSerializer

    def get_queryset(self):
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

