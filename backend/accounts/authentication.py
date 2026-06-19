"""
JWT authentication that periodically updates ``User.last_activity`` for online presence.
"""
from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from organization.session_policy import user_idle_session_expired
from .models import User
from .presence import ACTIVITY_UPDATE_INTERVAL

# Cookie names mirrored from frontend ``lib/auth-cookie-names.ts``.
_ACCESS_TOKEN_COOKIE_NAMES = ("emr_access_token", "npa_ecm_access_token")


def _validate_permissions_version(user, validated_token) -> None:
    if user is None or not getattr(user, "is_authenticated", False) or not user.pk:
        return
    token_pv = validated_token.get("pv")
    if token_pv is None:
        return
    db_pv = User.objects.filter(pk=user.pk).values_list("permissions_version", flat=True).first() or 1
    if int(token_pv) != int(db_pv):
        raise InvalidToken(
            {
                "detail": "Your access permissions changed. Please sign in again.",
                "code": "permissions_stale",
            }
        )


def _validate_idle_session(user) -> None:
    if user_idle_session_expired(user):
        raise InvalidToken(
            {
                "detail": "Session expired due to inactivity.",
                "code": "idle_timeout",
            }
        )


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


    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        _validate_permissions_version(user, validated_token)
        _validate_idle_session(user)
        return user


class JWTAuthenticationWithActivity(JWTAuthentication):
    """
    After a valid JWT is resolved, bump ``last_activity`` at most once every
    ``ACTIVITY_UPDATE_INTERVAL`` so the admin "online now" count reflects live API use.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if user is None or not user.is_authenticated or not user.pk:
            return user

        _validate_permissions_version(user, validated_token)
        _validate_idle_session(user)

        now = timezone.now()
        threshold = now - ACTIVITY_UPDATE_INTERVAL
        last = user.last_activity
        if last is None or last < threshold:
            User.objects.filter(pk=user.pk).update(last_activity=now)
            user.last_activity = now

        return user
