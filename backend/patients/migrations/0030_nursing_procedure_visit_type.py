from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0029_renal_liver_abdominal_catalog'),
    ]

    operations = [
        migrations.AlterField(
            model_name='visit',
            name='visit_type',
            field=models.CharField(
                choices=[
                    ('consultation', 'Consultation'),
                    ('follow_up', 'Follow-up'),
                    ('emergency', 'Emergency'),
                    ('routine', 'Routine Checkup'),
                    ('responsibility_form', 'Responsibility Form'),
                    ('annual_checkup', 'Annual Check-up'),
                    ('nursing_procedure', 'Nursing Procedure'),
                ],
                default='consultation',
                max_length=20,
            ),
        ),
    ]
