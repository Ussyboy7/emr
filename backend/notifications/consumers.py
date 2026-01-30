import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async

from .models import Notification
from .serializers import NotificationSerializer

logger = logging.getLogger(__name__)


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for in-app notifications.

    Auth: JWT token via query string `?token=...` (handled by JWT middleware).
    Group: notifications_<user_id>
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or getattr(user, "is_anonymous", True):
            await self.close(code=4401)  # unauthorized
            return

        self.user = user
        self.group_name = f"notifications_{user.id}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Send initial unread count
        await self.send_json({
            "type": "unread_count",
            "count": await self._get_unread_count(),
        })

    async def disconnect(self, close_code):
        try:
            if getattr(self, "group_name", None):
                await self.channel_layer.group_discard(self.group_name, self.channel_name)
        except Exception:
            logger.exception("Error discarding notifications group")

    async def receive_json(self, content, **kwargs):
        message_type = content.get("type")
        if message_type == "ping":
            await self.send_json({"type": "pong"})
            return

        if message_type == "get_unread_count":
            await self.send_json({"type": "unread_count", "count": await self._get_unread_count()})
            return

        # Client-side mark_read is handled via REST endpoints for now
        await self.send_json({"type": "error", "message": "Unsupported message type"})

    async def notification_message(self, event):
        """
        Handler for group_send messages from signals/services.
        Expects:
          event = {"type": "notification.message", "payload": {...}}
        """
        payload = event.get("payload") or {}
        await self.send_json(payload)

    @database_sync_to_async
    def _get_unread_count(self) -> int:
        return Notification.objects.filter(user=self.user, status="unread").count()

    @database_sync_to_async
    def _serialize_notification(self, notification_id: int) -> dict:
        notification = Notification.objects.get(id=notification_id, user=self.user)
        return NotificationSerializer(notification).data

