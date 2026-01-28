# One Lab ID per order: store on LabOrder so we have a single source of truth

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('laboratory', '0007_lab_number_use_order_id_format'),
    ]

    operations = [
        migrations.AddField(
            model_name='laborder',
            name='lab_number',
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True),
        ),
    ]
