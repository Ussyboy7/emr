# Lab ID (lab_number): keep BT-YY-NNNN format, generated at sample collection.
# - unique=True removed: all tests in an order share the same Lab ID.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('laboratory', '0006_add_category_field'),
    ]

    operations = [
        migrations.AlterField(
            model_name='labtest',
            name='lab_number',
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True),
        ),
    ]
