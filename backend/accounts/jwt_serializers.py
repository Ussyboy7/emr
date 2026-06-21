"""
JWT token serializers — allow the same `username` form field to carry either
the account username or the email (case-insensitive for email).
"""
from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import AccessToken

from organization.session_policy import user_idle_session_expired

User = get_user_model()


class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Accepts `username` + `password` from the client. If `username` looks like
    an email, resolve it to the real Django username before authentication.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["pv"] = getattr(user, "permissions_version", 1)
        return token

    def validate(self, attrs):
        field = User.USERNAME_FIELD
        cred = attrs.get(field)
        if not isinstance(cred, str):
            return super().validate(attrs)

        cred = cred.strip()
        attrs[field] = cred
        if not cred:
            return super().validate(attrs)

        if "@" in cred:
            q = User.objects.filter(email__iexact=cred)
            n = q.count()
            if n == 1:
                attrs[field] = q.get().get_username()
            elif n > 1:
                raise serializers.ValidationError(
                    {
                        "detail": "Multiple accounts use this email. Sign in with your username.",
                    }
                )

        return super().validate(attrs)


class EmailOrUsernameTokenRefreshSerializer(TokenRefreshSerializer):
    """Re-issue access tokens with the current permissions_version claim."""

    def validate(self, attrs):
        incoming = self.token_class(attrs["refresh"])
        user = User.objects.filter(pk=incoming["user_id"]).first()
        if user is not None and user_idle_session_expired(user):
            raise InvalidToken(
                {
                    "detail": "Session expired due to inactivity.",
                    "code": "idle_timeout",
                }
            )
        data = super().validate(attrs)
        if user is None:
            return data
        access = AccessToken.for_user(user)
        access["pv"] = getattr(user, "permissions_version", 1)
        data["access"] = str(access)
        return data
