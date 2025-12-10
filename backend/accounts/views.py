"""
Views for the Accounts app.
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.contrib.auth import update_session_auth_hash

from .models import User
from .serializers import (
    UserSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    ChangePasswordSerializer,
)
from audit.services import AuditService


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
    filterset_fields = ['system_role', 'is_active', 'is_staff', 'is_management']
    search_fields = ['username', 'email', 'first_name', 'last_name', 'employee_id']
    ordering_fields = ['username', 'date_joined', 'last_name']
    ordering = ['username']
    
    def get_queryset(self):
        """Return queryset of all users."""
        return User.objects.all().select_related()
    
    def get_serializer_class(self):
        """Use appropriate serializer based on action."""
        if self.action == 'create':
            return UserCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer
    
    def get_permissions(self):
        """Only staff can create/update/delete users."""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]
    
    def perform_create(self, serializer):
        """Create user and log audit."""
        user = serializer.save()
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
        old_values = {
            'username': old_instance.username,
            'email': old_instance.email,
            'system_role': old_instance.system_role,
            'is_active': old_instance.is_active,
        }
        user = serializer.save()
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
        new_password = request.data.get('new_password')
        
        if not new_password:
            return Response(
                {"new_password": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate password using Django's password validators
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        
        try:
            validate_password(new_password, user)
        except ValidationError as e:
            return Response(
                {"new_password": list(e.messages)},
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

