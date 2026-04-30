from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('laboratory', '0013_external_manual_lab_orders'),
    ]

    operations = [
        migrations.AddField(
            model_name='laborder',
            name='provisional_diagnosis',
            field=models.TextField(blank=True),
        ),
    ]
