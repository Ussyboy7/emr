# Generated manually for multi-file diagnostic uploads

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eyecare', '0002_eyesession_soap_note'),
    ]

    operations = [
        migrations.CreateModel(
            name='EyeSessionDiagnosticFile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                (
                    'category',
                    models.CharField(
                        choices=[
                            ('pachymetry', 'Pachymetry'),
                            ('oct', 'OCT'),
                            ('visual_field', 'Visual Field'),
                        ],
                        db_index=True,
                        max_length=30,
                    ),
                ),
                ('file', models.FileField(upload_to='eye_results/diagnostics/')),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                (
                    'session',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='diagnostic_uploads',
                        to='eyecare.eyesession',
                    ),
                ),
            ],
            options={
                'db_table': 'eye_session_diagnostic_files',
                'ordering': ['uploaded_at', 'id'],
            },
        ),
    ]
