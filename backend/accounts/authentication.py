"""
JWT authentication that periodically updates ``User.last_activity`` for online presence.
"""
from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import User
from .presence import ACTIVITY_UPDATE_INTERVAL

# Cookie names mirrored from frontend ``lib/auth-cookie-names.ts``.
_ACCESS_TOKEN_COOKIE_NAMES = ("emr_access_token", "npa_ecm_access_token")


class JWTCookieAuthentication(JWTAuthentication):
    """
    Authenticate via ``Authorization: Bearer`` when present, otherwise read the
    access token from the session cookie set at login.

    Used for protected media so ``<img src>`` and ``window.open`` work on the
    same origin without embedding tokens in URLs.
    """

    def authenticate(self, request):
        if self.get_header(request) is not None:
            return super().authenticate(request)

        raw_token = None
        for cookie_name in _ACCESS_TOKEN_COOKIE_NAMES:
            raw_token = request.COOKIES.get(cookie_name)
            if raw_token:
                break
        if not raw_token:
            return None

        validated_token = self.get_validated_token(raw_token)
        user = self.get_user(validated_token)
        if user is None:
            return None
        return user, validated_token


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
