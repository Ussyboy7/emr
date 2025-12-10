"""
Signals for audit logging user activities.
"""
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver
from audit.services import AuditService


@receiver(user_logged_in)
def log_user_login(sender, request, user, **kwargs):
    """Log successful user login via Django admin or other authentication backends."""
    AuditService.log_activity(
        user=user,
        action='login',
        object_type='user',
        object_id=str(user.id),
        module='authentication',
        object_repr=user.get_full_name() or user.username,
        description=f'User {user.get_full_name() or user.username} logged in via {sender.__name__ if hasattr(sender, "__name__") else "Django"}',
        result='success',
        severity='info',
        request=request,
    )


@receiver(user_logged_out)
def log_user_logout(sender, request, user, **kwargs):
    """Log user logout."""
    if user:
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


@receiver(user_login_failed)
def log_user_login_failed(sender, credentials, request, **kwargs):
    """Log failed login attempts."""
    username = credentials.get('username', 'unknown')
    AuditService.log_activity(
        user=None,
        action='login',
        object_type='user',
        object_id='',
        module='authentication',
        object_repr=username,
        description=f'Failed login attempt for {username}',
        result='failure',
        severity='warning',
        request=request,
    )

