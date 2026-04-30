from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('organization', '0002_outpatient_clinic_types'),
        ('laboratory', '0012_labtestresultattachment'),
    ]

    operations = [
        migrations.AddField(
            model_name='laborder',
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
            model_name='laborder',
            name='external_clinic',
            field=models.ForeignKey(
                blank=True,
                help_text='Originating clinic/facility for manual external requests.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='external_lab_orders',
                to='organization.clinic',
            ),
        ),
        migrations.AddField(
            model_name='laborder',
            name='external_requesting_doctor_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='laborder',
            name='manual_request_reference',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='laborder',
            name='manual_request_file',
            field=models.FileField(blank=True, null=True, upload_to='lab_requests/manual/'),
        ),
        migrations.AddIndex(
            model_name='laborder',
            index=models.Index(fields=['source_type'], name='lab_orders_source__e9899c_idx'),
        ),
    ]
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('organization', '0002_outpatient_clinic_types'),
        ('laboratory', '0012_labtestresultattachment'),
    ]

    operations = [
        migrations.AddField(
            model_name='laborder',
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
            model_name='laborder',
            name='external_clinic',
            field=models.ForeignKey(
                blank=True,
                help_text='Originating clinic/facility for manual external requests.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='external_lab_orders',
                to='organization.clinic',
            ),
        ),
        migrations.AddField(
            model_name='laborder',
            name='external_requesting_doctor_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='laborder',
            name='manual_request_reference',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='laborder',
            name='manual_request_file',
            field=models.FileField(blank=True, null=True, upload_to='lab_requests/manual/'),
        ),
        migrations.AddIndex(
            model_name='laborder',
            index=models.Index(fields=['source_type'], name='lab_orders_source__e9899c_idx'),
        ),
    ]
