"""
Views for the Permissions app.
"""
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from drf_spectacular.utils import extend_schema, extend_schema_view

from permissions.drf_permissions import ApiPageAccessPermission
from permissions.user_management import CanManageRoles, CanManageUsers, filter_users_by_managed_departments, assert_user_in_managed_departments
from common.openapi import document_viewset
from .models import Role, UserRole
from .serializers import RoleSerializer, UserRoleSerializer
from audit.services import AuditService
from django.db.models import Count, Q


@extend_schema_view(
    list=extend_schema(summary="List roles", tags=["Permissions"]),
    retrieve=extend_schema(summary="Retrieve role", tags=["Permissions"]),
    create=extend_schema(summary="Create role", tags=["Permissions"]),
    update=extend_schema(summary="Update role", tags=["Permissions"]),
    partial_update=extend_schema(summary="Partially update role", tags=["Permissions"]),
    destroy=extend_schema(summary="Delete role", tags=["Permissions"]),
)
class RoleViewSet(viewsets.ModelViewSet):
    """ViewSet for managing roles."""

    serializer_class = RoleSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['type', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']

    def get_permissions(self):
        page = ApiPageAccessPermission()
        if self.action in ('list', 'retrieve', 'list_stats', 'users'):
            return [CanManageUsers(), page]
        return [CanManageRoles(), page]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Role.objects.none()
        
        qs = Role.objects.all().prefetch_related('user_roles')
        tg = (self.request.query_params.get('type_group') or '').strip().lower()
        if tg == 'system':
            qs = qs.filter(type='admin')
        elif tg == 'clinical':
            qs = qs.filter(
                type__in=['doctor', 'nurse', 'lab_tech', 'pharmacist', 'radiologist']
            )
        elif tg == 'administrative':
            qs = qs.filter(type='records')
        elif tg == 'custom':
            qs = qs.filter(type='custom')
        return qs
    
    def perform_create(self, serializer):
        """Create role and log audit."""
        role = serializer.save()
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='role',
            object_id=str(role.id),
            module='administration',
            object_repr=role.name,
            description=f'Created role: {role.name}',
            new_values={'name': role.name, 'type': role.type, 'is_active': role.is_active},
            request=self.request,
        )
    
    def perform_update(self, serializer):
        """Update role and log audit."""
        old_instance = self.get_object()
        old_values = {
            'name': old_instance.name,
            'type': old_instance.type,
            'is_active': old_instance.is_active,
        }
        role = serializer.save()
        new_values = {
            'name': role.name,
            'type': role.type,
            'is_active': role.is_active,
        }
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='role',
            object_id=str(role.id),
            module='administration',
            object_repr=role.name,
            description=f'Updated role: {role.name}',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )
    
    def perform_destroy(self, instance):
        """Delete role and log audit."""
        role_id = instance.id
        role_name = instance.name
        AuditService.log_activity(
            user=self.request.user,
            action='delete',
            object_type='role',
            object_id=str(role_id),
            module='administration',
            object_repr=role_name,
            description=f'Deleted role: {role_name}',
            old_values={'name': role_name},
            request=self.request,
        )
        instance.delete()
    
    @extend_schema(tags=["Permissions"], summary="Users", description="Get all users with this role.")
    @action(detail=True, methods=['get'])
    def users(self, request, pk=None):
        """Get all users with this role."""
        role = self.get_object()
        user_roles = role.user_roles.all().select_related('user', 'assigned_by')
        serializer = UserRoleSerializer(user_roles, many=True)
        return Response(serializer.data)

    @extend_schema(tags=["Permissions"], summary="List stats", description="Role KPI counts (replaces parallel COUNT requests).")
    @action(detail=False, methods=['get'], url_path='list-stats')
    def list_stats(self, request):
        """Role KPI counts (replaces parallel COUNT requests)."""
        clinical_types = ['doctor', 'nurse', 'lab_tech', 'pharmacist', 'radiologist']
        base = Role.objects.all()
        return Response({
            'total': base.count(),
            'active': base.filter(is_active=True).count(),
            'clinical': base.filter(type__in=clinical_types).count(),
            'totalUsers': UserRole.objects.values('user_id').distinct().count(),
        })


@document_viewset(tag="Permissions", resource="user roles")
class UserRoleViewSet(viewsets.ModelViewSet):
    """ViewSet for managing user-role assignments."""

    serializer_class = UserRoleSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['user', 'role']
    ordering_fields = ['assigned_at']
    ordering = ['-assigned_at']

    def get_permissions(self):
        return [CanManageUsers(), ApiPageAccessPermission()]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return UserRole.objects.none()

        qs = UserRole.objects.all().select_related('user', 'role', 'assigned_by')
        return filter_users_by_managed_departments(qs, self.request.user, user_field='user')

    @extend_schema(tags=["Permissions"], summary="Summary", description="Summary counts for role assignments.")
    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Summary counts for role assignments.

        - assignments: total user-role rows
        - unique_users: distinct users with >= 1 role assignment
        """
        qs = self.filter_queryset(self.get_queryset())
        return Response(
            {
                "assignments": qs.count(),
                "unique_users": qs.values("user_id").distinct().count(),
            }
        )
    
    def perform_create(self, serializer):
        user = serializer.validated_data.get("user")
        if user is not None:
            assert_user_in_managed_departments(self.request.user, user)
        user_role = serializer.save(assigned_by=self.request.user)
        
        # Log audit
        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='user_role',
            object_id=str(user_role.id),
            module='administration',
            object_repr=f'Role assignment: {user_role.role.name} to {user_role.user.get_full_name() or user_role.user.username}',
            description=f'Assigned role {user_role.role.name} to user {user_role.user.get_full_name() or user_role.user.username}',
            new_values={'user_id': str(user_role.user.id), 'role_id': str(user_role.role.id), 'role_name': user_role.role.name},
            request=self.request,
        )
    
    def perform_destroy(self, instance):
        """Remove user role and log audit."""
        assert_user_in_managed_departments(self.request.user, instance.user)
        user_role_id = instance.id
        user_name = instance.user.get_full_name() or instance.user.username
        role_name = instance.role.name
        
        AuditService.log_activity(
            user=self.request.user,
            action='delete',
            object_type='user_role',
            object_id=str(user_role_id),
            module='administration',
            object_repr=f'Role removal: {role_name} from {user_name}',
            description=f'Removed role {role_name} from user {user_name}',
            old_values={'user_id': str(instance.user.id), 'role_id': str(instance.role.id), 'role_name': role_name},
            request=self.request,
        )
        instance.delete()

