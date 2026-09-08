# Generated manually for dispense soft-lock fields

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("pharmacy", "0046_backfill_store_inventory_location_clinic"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescription",
            name="dispensing_by",
            field=models.ForeignKey(
                blank=True,
                help_text="Pharmacist currently holding the dispense modal lock",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="prescriptions_being_dispensed",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="prescription",
            name="dispensing_lock_heartbeat_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Last heartbeat from the open dispense modal",
                null=True,
            ),
        ),
    ]
