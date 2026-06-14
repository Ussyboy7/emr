"""
Custom authentication views with audit logging.
"""
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiResponse
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenObtainPairView,
    TokenRefreshView,
)
from rest_framework import status
from audit.services import AuditService

from .jwt_serializers import EmailOrUsernameTokenObtainPairSerializer
from .models import User as AccountUser


def _resolve_user_for_login_audit(identifier: str):
    """Match login identifier to User after a successful token issue (email or username)."""
    if not identifier or not str(identifier).strip():
        return None
    idv = str(identifier).strip()
    if "@" in idv:
        return AccountUser.objects.filter(email__iexact=idv).first()
    return (
        AccountUser.objects.filter(username__iexact=idv).first()
        or AccountUser.objects.filter(username=idv).first()
    )


class CustomTokenObtainPairView(TokenObtainPairView):
    """Custom token obtain view with audit logging."""

    serializer_class = EmailOrUsernameTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    @extend_schema(
        summary="Obtain JWT token pair",
        description=(
            "Authenticate with username or email and password. "
            "Returns access and refresh tokens; also updates last login and audit log."
        ),
        tags=["Authentication"],
        responses={
            200: OpenApiResponse(description="Token pair issued"),
            401: OpenApiResponse(description="Invalid credentials"),
            429: OpenApiResponse(description="Rate limit exceeded"),
        },
    )
    def post(self, request, *args, **kwargs):
        raw_login = (request.data.get("username") or "")
        response = super().post(request, *args, **kwargs)

        if response.status_code == status.HTTP_200_OK:
            try:
                user = _resolve_user_for_login_audit(raw_login)

                if user is not None:
                    from django.utils import timezone

                    now = timezone.now()
                    user.last_login = now
                    user.last_activity = now
                    user.save(update_fields=["last_login", "last_activity"])

                    AuditService.log_activity(
                        user=user,
                        action="login",
                        object_type="user",
                        object_id=str(user.id),
                        module="authentication",
                        object_repr=user.get_full_name() or user.username,
                        description=f"User {user.get_full_name() or user.username} logged in successfully via API",
                        result="success",
                        severity="info",
                        request=request,
                    )
                else:
                    AuditService.log_activity(
                        user=None,
                        action="login",
                        object_type="user",
                        object_id="",
                        module="authentication",
                        object_repr=str(raw_login) or "unknown",
                        description="Login succeeded but user could not be resolved for audit",
                        result="error",
                        severity="warning",
                        request=request,
                    )
            except Exception:
                # Avoid breaking login if audit or last_login update fails
                pass
        else:
            # Login failed - log the attempt
            error_detail = ''
            if hasattr(response, 'data') and isinstance(response.data, dict):
                error_detail = str(response.data.get('detail', ''))
            
            AuditService.log_activity(
                user=None,
                action="login",
                object_type="user",
                object_id="",
                module="authentication",
                object_repr=raw_login or "unknown",
                description=f"Failed login attempt for {raw_login or 'unknown'}"
                + (f": {error_detail}" if error_detail else ""),
                result="failure",
                severity="warning",
                request=request,
            )
        
        return response


@extend_schema_view(
    post=extend_schema(
        summary="Refresh access token",
        tags=["Authentication"],
        responses={200: OpenApiResponse(description="New access token")},
    )
)
class CustomTokenRefreshView(TokenRefreshView):
    """Token refresh with scoped rate limiting."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_refresh"


@extend_schema_view(
    post=extend_schema(
        summary="Logout (blacklist refresh token)",
        tags=["Authentication"],
        responses={200: OpenApiResponse(description="Token blacklisted")},
    )
)
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

