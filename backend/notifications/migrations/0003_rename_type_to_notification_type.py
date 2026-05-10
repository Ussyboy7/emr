"""Rename ``Notification.type`` → ``Notification.notification_type``.

Why
---
``type`` shadows the Python builtin and was already inconsistent with the
frontend (which has always used ``notification_type`` in the wire format
and in TS interfaces). The previous mismatch meant the frontend's
``?notification_type=...`` filter query was silently no-op'd by DRF — so
this rename also restores the type filter on the listing endpoint.

This migration also drops and recreates the composite (``type``,
``priority``) index, which Django infers automatically as part of the
rename.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_alter_notification_action_url"),
    ]

    operations = [
        migrations.RenameField(
            model_name="notification",
            old_name="type",
            new_name="notification_type",
        ),
    ]
