from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('consultation', '0021_seed_referral_facilities'),
    ]

    operations = [
        migrations.AddField(
            model_name='consultationroom',
            name='room_type',
            field=models.CharField(
                choices=[
                    ('consultation', 'Consultation'),
                    ('procedure', 'Procedure'),
                    ('emergency', 'Emergency'),
                    ('examination', 'Examination'),
                ],
                default='consultation',
                max_length=20,
            ),
        ),
    ]
