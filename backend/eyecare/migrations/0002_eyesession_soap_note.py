from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eyecare', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='eyesession',
            name='soap_note',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='eyesession',
            name='pachymetry_file',
            field=models.FileField(blank=True, null=True, upload_to='eye_results/pachymetry/'),
        ),
        migrations.AddField(
            model_name='eyesession',
            name='oct_file',
            field=models.FileField(blank=True, null=True, upload_to='eye_results/oct/'),
        ),
        migrations.AddField(
            model_name='eyesession',
            name='visual_field_file',
            field=models.FileField(blank=True, null=True, upload_to='eye_results/visual_fields/'),
        ),
    ]
