from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("organization", "0006_backfill_multi_clinic"),
    ]

    operations = [
        migrations.AddField(
            model_name="department",
            name="deputy_head",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="departments_deputied",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
