from __future__ import annotations

from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError


User = get_user_model()


@sync_to_async
def _get_user(user_id):
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return None


class JWTAuthMiddleware(BaseMiddleware):
    """
    Authenticate WebSocket connections via JWT in query string:
      ws://.../ws/notifications/?token=<access>
    """

    async def __call__(self, scope, receive, send):
        # Import lazily to avoid AppRegistryNotReady at process boot
        from django.contrib.auth.models import AnonymousUser

        try:
            raw_qs = scope.get("query_string", b"").decode()
            qs = parse_qs(raw_qs)
            token = (qs.get("token") or [None])[0]
            if token:
                try:
                    access = AccessToken(token)
                    user_id = access.get("user_id")
                    if user_id is not None:
                        user = await _get_user(user_id)
                        scope["user"] = user or AnonymousUser()
                    else:
                        scope["user"] = AnonymousUser()
                except TokenError:
                    scope["user"] = AnonymousUser()
            else:
                scope["user"] = AnonymousUser()
        except Exception:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(inner)

