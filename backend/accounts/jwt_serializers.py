"""
JWT token serializers — allow the same `username` form field to carry either
the account username or the email (case-insensitive for email).
"""
from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Accepts `username` + `password` from the client. If `username` looks like
    an email, resolve it to the real Django username before authentication.
    """

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
            # n == 0: leave cred as-is; authenticate() will fail as usual

        return super().validate(attrs)
