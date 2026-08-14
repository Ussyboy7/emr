"""
Views for the Accounts app.
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.contrib.auth import update_session_auth_hash
from django.db import transaction
from django.db import models
from django.db.models import Prefetch

from .models import User, SystemRole
from .serializers import (
    UserSerializer,
    UserDirectorySerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    ChangePasswordSerializer,
    SystemRoleSerializer,
)
from audit.services import AuditService
from permissions.drf_permissions import ApiPageAccessPermission
from permissions.models import Role, UserRole
from permissions.access_role import sync_system_role_from_access_role
from permissions.session_version import bump_user_permissions_version
from permissions.user_management import (
    CanManageUsers,
    assert_department_id_managed,
    assert_user_in_managed_departments,
    filter_users_by_managed_departments,
    managed_department_ids,
)
from organization.models import Department
from common.openapi import document_viewset
from drf_spectacular.utils import extend_schema


@document_viewset(tag="Accounts", resource="users")
class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing users.

    list: Get a list of all users
    retrieve: Get user details
    create: Create a new user
    update: Update user information
    partial_update: Partially update user information
    destroy: Delete user
    """

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['system_role', 'is_active', 'is_staff', 'is_management', 'location_clinic', 'department']
    search_fields = ['username', 'email', 'first_name', 'last_name', 'employee_id']
    ordering_fields = ['username', 'date_joined', 'last_name']
    ordering = ['username']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return User.objects.none()
        
        """
        Return queryset of users.

        Department scoping:
        - Superusers: can list/manage all users.
        - Everyone else: user-management operations (list + modifications) are restricted to the
          requester's department, so module admins only see/manage users in their module.

        Note: We keep `retrieve` unscoped so other parts of the app (e.g., displaying the ordering
        doctor's name) can look up staff across modules. Mutations remain protected below.
        """
        qs = User.objects.all().select_related('location_clinic', 'department').prefetch_related(
            Prefetch(
                'user_roles',
                queryset=UserRole.objects.select_related('role').filter(role__is_active=True).order_by('-assigned_at'),
            )
        )

        if not getattr(self.request, "user", None) or not self.request.user.is_authenticated:
            return qs.none()

        if self.action in [
            'list', 'create', 'update', 'partial_update', 'destroy', 'reset_password', 'stats',
        ]:
            qs = filter_users_by_managed_departments(qs, self.request.user)
            access_role = self.request.query_params.get('access_role')
            if access_role not in (None, '', 'all'):
                try:
                    qs = qs.filter(user_roles__role_id=int(access_role)).distinct()
                except (TypeError, ValueError):
                    pass

        return qs

    def get_serializer_class(self):
        """Use appropriate serializer based on action."""
        if self.action in ['directory', 'public']:
            return UserDirectorySerializer
        if self.action == 'create':
            return UserCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer

    def get_permissions(self):
        """
        Permissions:
        - Admin-only: list/retrieve + all mutations on /accounts/users/*
        - Authenticated: /auth/me, /auth/me patch, change_password, staff directory lookups
        """
        page = ApiPageAccessPermission()
        if self.action in ['me', 'update_me', 'change_password', 'directory', 'public']:
            return [permissions.IsAuthenticated(), page]
        if self.action in ['list', 'retrieve', 'create', 'update', 'partial_update', 'destroy', 'reset_password', 'stats']:
            return [CanManageUsers(), page]
        return [permissions.IsAuthenticated(), page]

    @extend_schema(tags=["Accounts"], summary="Stats", description="Lightweight user counts for admin dashboards.")
    @action(detail=False, methods=["get"], permission_classes=[CanManageUsers])
    def stats(self, request):
        """
        Lightweight user counts for admin dashboards.

        Returns:
        - total_active: active users in scope
        - by_system_role: map of system_role -> active count (empty role omitted)
        """
        qs = self.get_queryset().filter(is_active=True)
        by_role = (
            qs.exclude(system_role__isnull=True)
            .exclude(system_role__exact="")
            .values("system_role")
            .annotate(count=models.Count("id"))
            .order_by()
        )
        return Response(
            {
                "total_active": qs.count(),
                "by_system_role": {r["system_role"]: r["count"] for r in by_role},
            }
        )

    @extend_schema(tags=["Accounts"], summary="Directory", description="Staff directory endpoint for cross-department lookups.")
    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def directory(self, request):
        """
        Staff directory endpoint for cross-department lookups.

        Returns a minimal user representation. Supports search/filter/order/pagination.
        """
        qs = User.objects.filter(is_active=True).select_related('location_clinic', 'department')
        qs = self.filter_queryset(qs)
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = UserDirectorySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = UserDirectorySerializer(qs, many=True)
        return Response(serializer.data)

    @extend_schema(tags=["Accounts"], summary="Public", description="Minimal user profile for cross-department display (e.g., doctor name).")
    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def public(self, request, pk=None):
        """Minimal user profile for cross-department display (e.g., doctor name)."""
        user = User.objects.select_related('location_clinic', 'department').get(pk=pk)
        return Response(UserDirectorySerializer(user).data)

    def perform_create(self, serializer):
        """Create user with explicit access role in one atomic transaction."""
        raw_role_id = self.request.data.get("access_role_id")
        if raw_role_id in (None, ""):
            raise ValidationError({"access_role_id": ["This field is required."]})
        try:
            role_id = int(raw_role_id)
        except (TypeError, ValueError):
            raise ValidationError({"access_role_id": ["A valid integer is required."]})
        selected_role = Role.objects.filter(id=role_id, is_active=True).first()
        if selected_role is None:
            raise ValidationError({"access_role_id": ["Selected access role does not exist or is inactive."]})

        # Enforce department scoping for non-superusers creating users.
        dept_ids = managed_department_ids(self.request.user)
        if dept_ids is not None:
            if not dept_ids:
                raise ValidationError(
                    {"department": ["Your account has no department assigned. Contact an administrator."]}
                )
            requested_dept = serializer.validated_data.get("department")
            if requested_dept is not None:
                assert_department_id_managed(self.request.user, requested_dept.id)
            elif len(dept_ids) == 1:
                serializer.validated_data["department"] = Department.objects.get(
                    pk=next(iter(dept_ids))
                )
            elif self.request.user.department_id in dept_ids:
                serializer.validated_data["department"] = self.request.user.department
            else:
                raise ValidationError({"department": ["This field is required."]})

        with transaction.atomic():
            user = serializer.save()
            UserRole.objects.create(
                user=user,
                role=selected_role,
                assigned_by=self.request.user,
            )
            sync_system_role_from_access_role(user)

        AuditService.log_activity(
            user=self.request.user,
            action='create',
            object_type='user',
            object_id=str(user.id),
            module='administration',
            object_repr=user.get_full_name() or user.username,
            description=f'Created user account for {user.get_full_name() or user.username}',
            new_values={'username': user.username, 'email': user.email, 'system_role': user.system_role},
            request=self.request,
        )

    def perform_update(self, serializer):
        """Update user and log audit."""
        old_instance = self.get_object()

        # Enforce department scoping for non-superusers updating users.
        assert_user_in_managed_departments(self.request.user, old_instance)
        if "department" in serializer.validated_data:
            new_dept = serializer.validated_data.get("department")
            if new_dept is not None:
                assert_department_id_managed(self.request.user, new_dept.id)
        if "location_clinic" in serializer.validated_data and not self.request.user.is_superuser:
            new_clinic = serializer.validated_data.get("location_clinic")
            if (
                new_clinic is not None
                and self.request.user.location_clinic_id is not None
                and new_clinic.id != self.request.user.location_clinic_id
            ):
                raise PermissionDenied("You cannot change a user to another clinic.")

        old_values = {
            'username': old_instance.username,
            'email': old_instance.email,
            'system_role': old_instance.system_role,
            'is_active': old_instance.is_active,
        }
        user = serializer.save()
        if (
            "custom_pages_mode" in serializer.validated_data
            or "custom_pages" in serializer.validated_data
        ):
            bump_user_permissions_version(user.pk)

        new_values = {
            'username': user.username,
            'email': user.email,
            'system_role': user.system_role,
            'is_active': user.is_active,
        }
        AuditService.log_activity(
            user=self.request.user,
            action='update',
            object_type='user',
            object_id=str(user.id),
            module='administration',
            object_repr=user.get_full_name() or user.username,
            description=f'Updated user account for {user.get_full_name() or user.username}',
            old_values=old_values,
            new_values=new_values,
            request=self.request,
        )

    def perform_destroy(self, instance):
        """Delete user and log audit."""
        assert_user_in_managed_departments(self.request.user, instance)

        user_id = instance.id
        user_repr = instance.get_full_name() or instance.username
        AuditService.log_activity(
            user=self.request.user,
            action='delete',
            object_type='user',
            object_id=str(user_id),
            module='administration',
            object_repr=user_repr,
            description=f'Deleted user account for {user_repr}',
            old_values={'username': instance.username, 'email': instance.email},
            request=self.request,
        )
        instance.delete()

    @extend_schema(tags=["Accounts"], summary="Current user profile and permissions")
    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        """Get current user's profile."""
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    @extend_schema(tags=["Accounts"], summary="Update current user profile")
    @action(detail=False, methods=['patch'], permission_classes=[permissions.IsAuthenticated])
    def update_me(self, request):
        """Update current user's profile."""
        # Validate active_clinic is one of the user's assigned clinics
        active_clinic_id = request.data.get('active_clinic')
        if active_clinic_id is not None:
            from organization.models import SystemConfig
            if SystemConfig.is_enabled('multi_clinic_enabled'):
                try:
                    clinic_id = int(active_clinic_id)
                except (TypeError, ValueError):
                    return Response(
                        {"active_clinic": ["Invalid clinic ID."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                from common.mixins import _can_view_all_facilities

                if not _can_view_all_facilities(request.user):
                    assigned_ids = set(request.user.location_clinics.values_list('id', flat=True))
                    if clinic_id not in assigned_ids:
                        return Response(
                            {"active_clinic": ["You are not assigned to this clinic."]},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
        serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(request.user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(tags=["Accounts"], summary="Change password", description="Change current user's password.")
    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def change_password(self, request):
        """Change current user's password."""
        serializer = ChangePasswordSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            if not user.check_password(serializer.validated_data['old_password']):
                # Log failed password change attempt
                AuditService.log_activity(
                    user=user,
                    action='update',
                    object_type='user',
                    object_id=str(user.id),
                    module='authentication',
                    object_repr=user.get_full_name() or user.username,
                    description='Failed password change attempt - incorrect old password',
                    result='failure',
                    severity='warning',
                    request=request,
                )
                return Response(
                    {"old_password": ["Wrong password."]},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            update_session_auth_hash(request, user)

            # Log successful password change
            AuditService.log_activity(
                user=user,
                action='update',
                object_type='user',
                object_id=str(user.id),
                module='authentication',
                object_repr=user.get_full_name() or user.username,
                description='User changed their password',
                result='success',
                request=request,
            )

            return Response({"message": "Password changed successfully."})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(tags=["Accounts"], summary="Reset password", description="Admin action to reset a user's password.")
    @action(detail=True, methods=['post'], permission_classes=[CanManageUsers])
    def reset_password(self, request, pk=None):
        """Admin action to reset a user's password."""
        user = self.get_object()

        assert_user_in_managed_departments(request.user, user)

        new_password = request.data.get('new_password')

        if not new_password:
            return Response(
                {"new_password": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST
            )

        # For admin password resets, only do basic validation
        # Skip Django's strict password validators to allow admin flexibility
        if len(new_password) < 8:
            return Response(
                {"new_password": ["Password must be at least 8 characters long."]},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(new_password)
        user.save()

        # Log audit
        AuditService.log_activity(
            user=request.user,
            action='update',
            object_type='user',
            object_id=str(user.id),
            module='administration',
            object_repr=user.get_full_name() or user.username,
            description=f'Password reset for {user.get_full_name() or user.username}',
            request=request,
        )

        return Response({"message": f"Password reset successfully for {user.get_full_name() or user.username}."})


@document_viewset(tag="Accounts", resource="system roles")
class SystemRoleViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing system roles (professional identities).
    """
    queryset = SystemRole.objects.all()
    serializer_class = SystemRoleSerializer

    def get_permissions(self):
        """
        Allow unauthenticated read access for listing system roles (needed for user creation forms),
        but require authentication for write operations.
        """
        if self.action in ['list', 'retrieve', 'stats']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return SystemRole.objects.none()
        
        queryset = SystemRole.objects.all()
        # Filter by active status if requested
        is_active = self.request.query_params.get('is_active', None)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        return queryset

    @extend_schema(tags=["Accounts"], summary="Stats", description="Get statistics about system roles.")
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get statistics about system roles."""
        stats = {
            'total': SystemRole.objects.count(),
            'active': SystemRole.objects.filter(is_active=True).count(),
            'inactive': SystemRole.objects.filter(is_active=False).count(),
        }
        return Response(stats)