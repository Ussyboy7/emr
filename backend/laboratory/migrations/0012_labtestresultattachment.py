from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('laboratory', '0011_labpartner'),
    ]

    operations = [
        migrations.CreateModel(
            name='LabTestResultAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('row_id', models.CharField(db_index=True, max_length=80)),
                ('row_name', models.CharField(blank=True, max_length=200)),
                ('file', models.FileField(upload_to='lab_results/attachments/')),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('test', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='result_attachments', to='laboratory.labtest')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='uploaded_lab_result_attachments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'lab_test_result_attachments',
                'ordering': ['uploaded_at'],
            },
        ),
        migrations.AddIndex(
            model_name='labtestresultattachment',
            index=models.Index(fields=['test', 'row_id'], name='lab_test_re_test_id_cfdaa0_idx'),
        ),
    ]
