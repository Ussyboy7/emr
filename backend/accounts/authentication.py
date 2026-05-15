"""
JWT authentication that periodically updates ``User.last_activity`` for online presence.
"""
from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import User
from .presence import ACTIVITY_UPDATE_INTERVAL


class JWTAuthenticationWithActivity(JWTAuthentication):
    """
    After a valid JWT is resolved, bump ``last_activity`` at most once every
    ``ACTIVITY_UPDATE_INTERVAL`` so the admin "online now" count reflects live API use.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if user is None or not user.is_authenticated or not user.pk:
            return user

        now = timezone.now()
        threshold = now - ACTIVITY_UPDATE_INTERVAL
        last = user.last_activity
        if last is None or last < threshold:
            User.objects.filter(pk=user.pk).update(last_activity=now)
            user.last_activity = now

        return user
