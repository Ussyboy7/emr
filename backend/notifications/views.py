"""
Views for the Notifications app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter
from django.utils import timezone

from .models import Notification, NotificationPreferences
from .serializers import NotificationSerializer, NotificationPreferencesSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing notifications."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['type', 'priority', 'status']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Return only current user's notifications."""
        return Notification.objects.filter(user=self.request.user)
    
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
    """ViewSet for managing notification preferences."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationPreferencesSerializer
    
    def get_queryset(self):
        """Return only current user's preferences."""
        return NotificationPreferences.objects.filter(user=self.request.user)
    
    def get_object(self):
        """Get or create preferences for current user."""
        preferences, created = NotificationPreferences.objects.get_or_create(
            user=self.request.user
        )
        return preferences

