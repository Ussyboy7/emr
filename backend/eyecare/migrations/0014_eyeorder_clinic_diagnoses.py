from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("eyecare", "0013_eyesession_status_completed_idx"),
    ]

    operations = [
        migrations.AddField(
            model_name="eyeorder",
            name="clinic_diagnoses",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="ICD-10 diagnoses recorded by the treating eye clinic clinician: [{code, name, type}]",
            ),
        ),
    ]
