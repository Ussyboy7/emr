from django.db import migrations


def seed_idle_session_timeout(apps, schema_editor):
    SystemConfig = apps.get_model("organization", "SystemConfig")
    SystemConfig.objects.update_or_create(
        key="security.idle_session_timeout_minutes",
        defaults={
            "value": 30,
            "description": (
                "Org-wide idle session timeout in minutes. "
                "Users must have API activity within this window."
            ),
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("organization", "0007_department_deputy_head"),
    ]

    operations = [
        migrations.RunPython(seed_idle_session_timeout, migrations.RunPython.noop),
    ]
