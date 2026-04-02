from django.db import migrations, models
from django.utils import timezone


def backfill_last_resumed_for_active(apps, schema_editor):
    ConsultationSession = apps.get_model("consultation", "ConsultationSession")
    now = timezone.now()
    for session in ConsultationSession.objects.filter(status="active", last_resumed_at__isnull=True).iterator():
        session.last_resumed_at = session.started_at or now
        session.save(update_fields=["last_resumed_at"])


def reverse_backfill_last_resumed_for_active(apps, schema_editor):
    ConsultationSession = apps.get_model("consultation", "ConsultationSession")
    ConsultationSession.objects.filter(status="active").update(last_resumed_at=None)


class Migration(migrations.Migration):
    dependencies = [
        ("consultation", "0016_consultationsession_active_uniqueness"),
    ]

    operations = [
        migrations.AddField(
            model_name="consultationsession",
            name="active_seconds",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="consultationsession",
            name="last_resumed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="consultationsession",
            name="paused_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="consultationsession",
            name="status",
            field=models.CharField(
                choices=[
                    ("active", "Active"),
                    ("paused", "Paused"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                default="active",
                max_length=20,
            ),
        ),
        migrations.RunPython(
            backfill_last_resumed_for_active,
            reverse_backfill_last_resumed_for_active,
        ),
    ]
