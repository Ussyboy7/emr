# Generated manually — allow client-set administration time on create

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('nursing', '0006_nursingorder_admission'),
    ]

    operations = [
        migrations.AlterField(
            model_name='procedure',
            name='performed_at',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]
