# Generated migration: add unit to GenericMedication for sync with Drug Master

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pharmacy', '0020_liquid_pack_size_guardrails'),
    ]

    operations = [
        migrations.AddField(
            model_name='genericmedication',
            name='unit',
            field=models.CharField(blank=True, help_text='Default unit per dose, e.g. tablet, capsule, ml', max_length=50),
        ),
    ]
