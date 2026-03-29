from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('wards', '0003_expand_observation_admission_types'),
    ]

    operations = [
        migrations.AlterField(
            model_name='patientadmission',
            name='status',
            field=models.CharField(
                choices=[
                    ('admitted', 'Admitted'),
                    ('pending_discharge', 'Pending Discharge'),
                    ('discharged', 'Discharged'),
                    ('transferred', 'Transferred'),
                    ('absconded', 'Absconded'),
                    ('deceased', 'Deceased'),
                ],
                default='admitted',
                max_length=20,
            ),
        ),
    ]
