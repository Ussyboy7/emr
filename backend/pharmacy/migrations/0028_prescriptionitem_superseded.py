# Generated manually for combo-split prescribing record retention.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0027_merge_20260401_0001"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescriptionitem",
            name="superseded_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="prescriptionitem",
            name="superseded_split_into_ids",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
