# Generated manually for ward doctor orders

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('wards', '0003_expand_observation_admission_types'),
        ('nursing', '0005_backfill_observation_procedure_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='nursingorder',
            name='admission',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='ward_nursing_orders',
                to='wards.patientadmission',
            ),
        ),
    ]
