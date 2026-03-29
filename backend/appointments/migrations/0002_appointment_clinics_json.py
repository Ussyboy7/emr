# Generated manually for multi-clinic selection (aligned with Visit.clinics)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="clinics",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Standard clinic names (GOPD, Eye Clinic, Physiotherapy, …)",
            ),
        ),
    ]
