from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_received_at(apps, schema_editor):
    MedicationInventory = apps.get_model("pharmacy", "MedicationInventory")
    for row in MedicationInventory.objects.filter(received_at__isnull=True).iterator():
        row.received_at = row.created_at
        row.save(update_fields=["received_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0042_fix_generic_and_rx_units"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="medicationinventory",
            name="received_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When stock was physically received into this location",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="medicationinventory",
            name="received_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="medication_inventory_receipts",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(backfill_received_at, migrations.RunPython.noop),
    ]
