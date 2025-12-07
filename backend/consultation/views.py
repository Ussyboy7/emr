"""
Views for the Consultation app.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone

from .models import ConsultationRoom, ConsultationSession, ConsultationQueue
from .serializers import (
    ConsultationRoomSerializer,
    ConsultationSessionSerializer,
    ConsultationQueueSerializer,
)


class ConsultationRoomViewSet(viewsets.ModelViewSet):
    """ViewSet for managing consultation rooms."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ConsultationRoomSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'specialty', 'is_active']
    search_fields = ['name', 'room_number', 'location']
    ordering_fields = ['room_number', 'name']
    ordering = ['room_number']
    
    def get_queryset(self):
        return ConsultationRoom.objects.filter(is_active=True)
    
    @action(detail=True, methods=['get'])
    def queue(self, request, pk=None):
        """Get queue for a room."""
        room = self.get_object()
        queue_items = room.queue_items.filter(is_active=True).order_by('priority', 'queued_at')
        serializer = ConsultationQueueSerializer(queue_items, many=True)
        return Response(serializer.data)


class ConsultationSessionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing consultation sessions."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ConsultationSessionSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['room', 'patient', 'doctor', 'status']
    search_fields = ['session_id', 'chief_complaint', 'notes']
    ordering_fields = ['started_at']
    ordering = ['-started_at']
    
    def get_queryset(self):
        return ConsultationSession.objects.all().select_related('room', 'patient', 'doctor', 'visit', 'created_by')
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        """End a consultation session."""
        session = self.get_object()
        session.status = 'completed'
        session.ended_at = timezone.now()
        session.save()
        return Response(ConsultationSessionSerializer(session).data)


class ConsultationQueueViewSet(viewsets.ModelViewSet):
    """ViewSet for managing consultation queue."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = ConsultationQueueSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['room', 'patient', 'is_active']
    ordering_fields = ['priority', 'queued_at']
    ordering = ['priority', 'queued_at']
    
    def get_queryset(self):
        return ConsultationQueue.objects.all().select_related('room', 'patient', 'visit')
    
    @action(detail=True, methods=['post'])
    def call(self, request, pk=None):
        """Call a patient from the queue."""
        queue_item = self.get_object()
        queue_item.called_at = timezone.now()
        queue_item.is_active = False
        queue_item.save()
        return Response(ConsultationQueueSerializer(queue_item).data)

