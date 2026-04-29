from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('radiology', '0012_imagingpartner'),
    ]

    operations = [
        migrations.AddField(
            model_name='radiologystudy',
            name='custom_reports',
            field=models.JSONField(blank=True, default=list, help_text='Structured report rows for Other studies'),
        ),
        migrations.CreateModel(
            name='RadiologyStudyReportAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('row_id', models.CharField(db_index=True, max_length=80)),
                ('row_name', models.CharField(blank=True, max_length=200)),
                ('file', models.FileField(upload_to='radiology_reports/attachments/')),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('study', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='report_attachments', to='radiology.radiologystudy')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='uploaded_radiology_report_attachments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'radiology_study_report_attachments',
                'ordering': ['uploaded_at'],
            },
        ),
        migrations.AddIndex(
            model_name='radiologystudyreportattachment',
            index=models.Index(fields=['study', 'row_id'], name='radiology_s_study_i_c22db5_idx'),
        ),
    ]
