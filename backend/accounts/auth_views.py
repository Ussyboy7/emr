"""
Custom authentication views with audit logging.
"""
from rest_framework_simplejwt.views import TokenObtainPairView, TokenBlacklistView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from audit.services import AuditService


class CustomTokenObtainPairView(TokenObtainPairView):
    """Custom token obtain view with audit logging."""
    
    def post(self, request, *args, **kwargs):
        username = request.data.get('username', 'unknown')
        password_provided = bool(request.data.get('password'))
        
        response = super().post(request, *args, **kwargs)
        
        if response.status_code == status.HTTP_200_OK:
            # Login successful - extract user from response
            from accounts.models import User
            try:
                # Try to get user by username or email
                try:
                    user = User.objects.get(username=username)
                except User.DoesNotExist:
                    # Try email as username
                    user = User.objects.get(email=username)
                
                # Update last_login timestamp
                from django.utils import timezone
                user.last_login = timezone.now()
                user.save(update_fields=['last_login'])
                
                AuditService.log_activity(
                    user=user,
                    action='login',
                    object_type='user',
                    object_id=str(user.id),
                    module='authentication',
                    object_repr=user.get_full_name() or user.username,
                    description=f'User {user.get_full_name() or user.username} logged in successfully via API',
                    result='success',
                    severity='info',
                    request=request,
                )
            except User.DoesNotExist:
                # User doesn't exist but login succeeded (shouldn't happen, but log it)
                AuditService.log_activity(
                    user=None,
                    action='login',
                    object_type='user',
                    object_id='',
                    module='authentication',
                    object_repr=username,
                    description=f'Login succeeded but user {username} not found in database',
                    result='error',
                    severity='warning',
                    request=request,
                )
            except User.MultipleObjectsReturned:
                # Multiple users found (shouldn't happen, but log it)
                AuditService.log_activity(
                    user=None,
                    action='login',
                    object_type='user',
                    object_id='',
                    module='authentication',
                    object_repr=username,
                    description=f'Login succeeded but multiple users found for {username}',
                    result='error',
                    severity='error',
                    request=request,
                )
        else:
            # Login failed - log the attempt
            error_detail = ''
            if hasattr(response, 'data') and isinstance(response.data, dict):
                error_detail = str(response.data.get('detail', ''))
            
            AuditService.log_activity(
                user=None,
                action='login',
                object_type='user',
                object_id='',
                module='authentication',
                object_repr=username,
                description=f'Failed login attempt for {username}' + (f': {error_detail}' if error_detail else ''),
                result='failure',
                severity='warning',
                request=request,
            )
        
        return response


class CustomTokenBlacklistView(TokenBlacklistView):
    """Custom token blacklist view with audit logging for logout."""
    
    def post(self, request, *args, **kwargs):
        # Get user from token before blacklisting
        user = None
        try:
            # Extract token from request
            auth_header = request.META.get('HTTP_AUTHORIZATION', '')
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
                from rest_framework_simplejwt.tokens import UntypedToken
                from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
                from django.contrib.auth import get_user_model
                
                try:
                    validated_data = UntypedToken(token)
                    user_id = validated_data.get('user_id')
                    User = get_user_model()
                    user = User.objects.get(id=user_id)
                except (InvalidToken, TokenError, User.DoesNotExist):
                    pass
        except Exception:
            pass
        
        response = super().post(request, *args, **kwargs)
        
        # Log logout if successful
        if response.status_code == status.HTTP_200_OK and user:
            AuditService.log_activity(
                user=user,
                action='logout',
                object_type='user',
                object_id=str(user.id),
                module='authentication',
                object_repr=user.get_full_name() or user.username,
                description=f'User {user.get_full_name() or user.username} logged out',
                result='success',
                severity='info',
                request=request,
            )
        elif response.status_code != status.HTTP_200_OK:
            # Log failed logout attempt
            AuditService.log_activity(
                user=user,
                action='logout',
                object_type='user',
                object_id=str(user.id) if user else '',
                module='authentication',
                object_repr=user.get_full_name() or user.username if user else 'unknown',
                description='Failed logout attempt',
                result='failure',
                severity='warning',
                request=request,
            )
        
        return response

