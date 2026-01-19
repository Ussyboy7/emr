# Generated manually for lab number field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('laboratory', '0004_labtemplate_turnaround_time'),
    ]

    operations = [
        migrations.AddField(
            model_name='labtest',
            name='lab_number',
            field=models.CharField(blank=True, db_index=True, help_text='Lab number for sample identification (format: BT-YY-XXXX)', max_length=20, null=True, unique=True),
        ),
    ]
