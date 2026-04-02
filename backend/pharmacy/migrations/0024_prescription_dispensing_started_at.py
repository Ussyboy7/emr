from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0023_dispensary_receipt_line"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescription",
            name="dispensing_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
