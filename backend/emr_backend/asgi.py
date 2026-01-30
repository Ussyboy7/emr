"""
ASGI config for the EMR backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.0/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'emr_backend.settings')

# Initialize Django ASGI application early
django_asgi_app = get_asgi_application()

# NOTE: Import Channels routing + app websocket routes AFTER Django setup.
# Otherwise, importing modules that touch auth/models may trigger
# `AppRegistryNotReady: Apps aren't loaded yet.` during process boot.
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from notifications.middleware import JWTAuthMiddlewareStack  # noqa: E402
from notifications.routing import websocket_urlpatterns  # noqa: E402

# ASGI application with WebSocket support
application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JWTAuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})

