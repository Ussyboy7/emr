from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Notification
from .serializers import NotificationSerializer


@receiver(post_save, sender=Notification)
def broadcast_notification(sender, instance: Notification, created: bool, **kwargs):
    if not created:
        return

    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    group = f"notifications_{instance.user_id}"
    payload = {
        "type": "notification",
        "notification": NotificationSerializer(instance).data,
    }

    async_to_sync(channel_layer.group_send)(
        group,
        {
            "type": "notification_message",
            "payload": payload,
        },
    )

