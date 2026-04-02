from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0024_prescription_dispensing_started_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="dispense",
            name="dispense_context_snapshot",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
        migrations.AddField(
            model_name="dispense",
            name="prescribed_generic_name_snapshot",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="dispense",
            name="prescribed_medication_name_snapshot",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="dispense",
            name="prescribed_unit_snapshot",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
    ]
