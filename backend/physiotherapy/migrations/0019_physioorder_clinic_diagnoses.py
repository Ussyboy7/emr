from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("physiotherapy", "0018_physiosession_status_completed_idx"),
    ]

    operations = [
        migrations.AddField(
            model_name="physioorder",
            name="clinic_diagnoses",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="ICD-10 diagnoses recorded by the treating physiotherapist: [{code, name, type}]",
            ),
        ),
    ]
