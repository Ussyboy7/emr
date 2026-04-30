from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('laboratory', '0014_laborder_provisional_diagnosis'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='laborder',
            name='provisional_diagnosis',
        ),
    ]
