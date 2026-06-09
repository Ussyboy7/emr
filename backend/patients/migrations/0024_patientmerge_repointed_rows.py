from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0023_patient_merge_reason_patient_merged_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='patientmerge',
            name='repointed_rows',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
