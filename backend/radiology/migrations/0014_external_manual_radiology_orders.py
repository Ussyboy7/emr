from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('organization', '0002_outpatient_clinic_types'),
        ('radiology', '0013_radiology_custom_other_reports'),
    ]

    operations = [
        migrations.AddField(
            model_name='radiologyorder',
            name='source_type',
            field=models.CharField(
                choices=[
                    ('internal_emr', 'Internal EMR'),
                    ('external_manual', 'External manual request'),
                ],
                db_index=True,
                default='internal_emr',
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='radiologyorder',
            name='external_clinic',
            field=models.ForeignKey(
                blank=True,
                help_text='Originating clinic/facility for manual external requests.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='external_radiology_orders',
                to='organization.clinic',
            ),
        ),
        migrations.AddField(
            model_name='radiologyorder',
            name='external_requesting_doctor_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='radiologyorder',
            name='manual_request_reference',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='radiologyorder',
            name='manual_request_file',
            field=models.FileField(blank=True, null=True, upload_to='radiology_requests/manual/'),
        ),
        migrations.AddIndex(
            model_name='radiologyorder',
            index=models.Index(fields=['source_type'], name='radiology_o_source__94b0ef_idx'),
        ),
    ]
