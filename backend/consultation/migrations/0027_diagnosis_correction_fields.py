from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('consultation', '0026_normalize_consultation_queue_priority'),
    ]

    operations = [
        migrations.AddField(
            model_name='diagnosis',
            name='corrected_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='diagnosis',
            name='corrected_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='diagnoses_corrected',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='diagnosis',
            name='correction_notes',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='diagnosis',
            name='correction_reason',
            field=models.CharField(
                blank=True,
                choices=[
                    ('wrong_code', 'Wrong code selected'),
                    ('non_specific', 'More specific code available'),
                    ('duplicate', 'Duplicate or redundant code'),
                    ('typo', 'Typo / search mistake'),
                    ('other', 'Other'),
                ],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='diagnosis',
            name='original_icd10_code',
            field=models.ForeignKey(
                blank=True,
                help_text='ICD-10 code before the first records correction (if any).',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='diagnoses_original',
                to='consultation.icd10code',
            ),
        ),
    ]
