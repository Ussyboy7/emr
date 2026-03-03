from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0014_backfill_location_clinic'),
    ]

    operations = [
        migrations.AddField(
            model_name='vitalreading',
            name='blood_sugar',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text='Blood sugar in mg/dL',
                max_digits=6,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='vitalreading',
            name='pain_scale',
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text='Pain scale from 0 to 10',
                null=True,
                validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(10)],
            ),
        ),
    ]

