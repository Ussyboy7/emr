"""
Views for the Accounts app.
"""
from typing import Optional
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.contrib.auth import update_session_auth_hash

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
from permissions.models import Role, UserRole


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

    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['system_role', 'is_active', 'is_staff', 'is_management', 'clinic', 'department']
    search_fields = ['username', 'email', 'first_name', 'last_name', 'employee_id']
    ordering_fields = ['username', 'date_joined', 'last_name']
    ordering = ['username']

    def get_queryset(self):
        """
        Return queryset of users.

        Department scoping:
        - Superusers: can list/manage all users.
        - Everyone else: user-management operations (list + modifications) are restricted to the
          requester's department, so module admins only see/manage users in their module.

        Note: We keep `retrieve` unscoped so other parts of the app (e.g., displaying the ordering
        doctor's name) can look up staff across modules. Mutations remain protected below.
        """
        qs = User.objects.all().select_related('clinic', 'department')

        if not getattr(self.request, "user", None) or not self.request.user.is_authenticated:
            return qs.none()

        if self.request.user.is_superuser:
            return qs

        # Scope user-management surfaces to department only.
        if self.action in ['list', 'create', 'update', 'partial_update', 'destroy', 'reset_password']:
            if self.request.user.department_id is None:
                return qs.none()
            return qs.filter(department_id=self.request.user.department_id)

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
        if self.action in ['me', 'update_me', 'change_password', 'directory', 'public']:
            return [permissions.IsAuthenticated()]
        if self.action in ['list', 'retrieve', 'create', 'update', 'partial_update', 'destroy', 'reset_password']:
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def directory(self, request):
        """
        Staff directory endpoint for cross-department lookups.

        Returns a minimal user representation. Supports search/filter/order/pagination.
        """
        qs = User.objects.filter(is_active=True).select_related('clinic', 'department')
        qs = self.filter_queryset(qs)
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = UserDirectorySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = UserDirectorySerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def public(self, request, pk=None):
        """Minimal user profile for cross-department display (e.g., doctor name)."""
        user = User.objects.select_related('clinic', 'department').get(pk=pk)
        return Response(UserDirectorySerializer(user).data)

    def perform_create(self, serializer):
        """Create user and log audit."""
        # Enforce department scoping for non-superusers creating users.
        if not self.request.user.is_superuser:
            if self.request.user.department_id is None:
                raise ValidationError({"department": ["Your account has no department assigned. Contact an administrator."]})
            requested_dept = serializer.validated_data.get("department")
            if requested_dept is not None and requested_dept.id != self.request.user.department_id:
                raise PermissionDenied("You can only create users within your department.")

            # Force department to the requester's department if omitted.
            if requested_dept is None:
                serializer.validated_data["department"] = self.request.user.department

        user = serializer.save()

        # Auto-assign a Role so the user gets page permissions.
        # Frontend authorization relies on `permissions.pages`, which is derived from `user.user_roles`.
        # If a user is created without roles, they will land on /no-access.
        if not user.is_superuser and not user.user_roles.exists():
            role = self._pick_default_role_for_user(user)
            if role is not None:
                UserRole.objects.get_or_create(
                    user=user,
                    role=role,
                    defaults={"assigned_by": self.request.user},
                )

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
        if not self.request.user.is_superuser:
            if self.request.user.department_id is None:
                raise PermissionDenied("Your account has no department assigned.")
            if old_instance.department_id != self.request.user.department_id:
                raise PermissionDenied("You can only update users within your department.")
            # Prevent cross-department reassignment.
            if "department" in serializer.validated_data:
                new_dept = serializer.validated_data.get("department")
                if new_dept is not None and new_dept.id != self.request.user.department_id:
                    raise PermissionDenied("You cannot change a user to another department.")
            # Prevent clinic reassignment across departments (optional safeguard).
            if "clinic" in serializer.validated_data:
                new_clinic = serializer.validated_data.get("clinic")
                if new_clinic is not None and self.request.user.clinic_id is not None and new_clinic.id != self.request.user.clinic_id:
                    raise PermissionDenied("You cannot change a user to another clinic.")

        old_values = {
            'username': old_instance.username,
            'email': old_instance.email,
            'system_role': old_instance.system_role,
            'is_active': old_instance.is_active,
        }
        user = serializer.save()

        # If the user still has no roles after an update (common when only `system_role` was set),
        # auto-assign a reasonable default role.
        if not user.is_superuser and not user.user_roles.exists():
            role = self._pick_default_role_for_user(user)
            if role is not None:
                UserRole.objects.get_or_create(
                    user=user,
                    role=role,
                    defaults={"assigned_by": self.request.user},
                )

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

    def _pick_default_role_for_user(self, user: User) -> Optional[Role]:
        """
        Choose a default active Role for a user based on their `system_role` and department.

        This is a safety net to keep newly-created staff from landing on `/no-access`
        when roles were not explicitly assigned via the permissions UI.
        """
        system_role = (getattr(user, "system_role", "") or "").strip()

        # 1) Exact name match (preferred, explicit).
        if system_role:
            exact = Role.objects.filter(is_active=True, name__iexact=system_role).first()
            if exact is not None:
                return exact

        return None

    def perform_destroy(self, instance):
        """Delete user and log audit."""
        if not self.request.user.is_superuser:
            if self.request.user.department_id is None:
                raise PermissionDenied("Your account has no department assigned.")
            if instance.department_id != self.request.user.department_id:
                raise PermissionDenied("You can only delete users within your department.")

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

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        """Get current user's profile."""
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['patch'], permission_classes=[permissions.IsAuthenticated])
    def update_me(self, request):
        """Update current user's profile."""
        serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(request.user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

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

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def reset_password(self, request, pk=None):
        """Admin action to reset a user's password."""
        user = self.get_object()

        # Enforce department scoping for non-superusers resetting passwords.
        if not request.user.is_superuser:
            if request.user.department_id is None:
                raise PermissionDenied("Your account has no department assigned.")
            if user.department_id != request.user.department_id:
                raise PermissionDenied("You can only reset passwords for users within your department.")

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
        queryset = SystemRole.objects.all()
        # Filter by active status if requested
        is_active = self.request.query_params.get('is_active', None)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        return queryset

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get statistics about system roles."""
        stats = {
            'total': SystemRole.objects.count(),
            'active': SystemRole.objects.filter(is_active=True).count(),
            'inactive': SystemRole.objects.filter(is_active=False).count(),
        }
        return Response(stats)