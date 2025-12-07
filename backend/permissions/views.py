"""
Views for the Permissions app.
"""
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Role, UserRole
from .serializers import RoleSerializer, UserRoleSerializer


class RoleViewSet(viewsets.ModelViewSet):
    """ViewSet for managing roles."""
    
    permission_classes = [permissions.IsAdminUser]
    serializer_class = RoleSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['type', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_queryset(self):
        return Role.objects.all().prefetch_related('user_roles')
    
    @action(detail=True, methods=['get'])
    def users(self, request, pk=None):
        """Get all users with this role."""
        role = self.get_object()
        user_roles = role.user_roles.all().select_related('user', 'assigned_by')
        serializer = UserRoleSerializer(user_roles, many=True)
        return Response(serializer.data)


class UserRoleViewSet(viewsets.ModelViewSet):
    """ViewSet for managing user-role assignments."""
    
    permission_classes = [permissions.IsAdminUser]
    serializer_class = UserRoleSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['user', 'role']
    ordering_fields = ['assigned_at']
    ordering = ['-assigned_at']
    
    def get_queryset(self):
        return UserRole.objects.all().select_related('user', 'role', 'assigned_by')
    
    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)

