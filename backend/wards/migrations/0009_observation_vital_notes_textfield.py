from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('wards', '0008_add_clinic_fk'),
    ]

    operations = [
        migrations.AlterField(
            model_name='admissionobservationvital',
            name='notes',
            field=models.TextField(blank=True),
        ),
    ]
