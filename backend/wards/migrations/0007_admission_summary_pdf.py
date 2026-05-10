"""Persist the locked discharge-summary PDF on the admission so the audit
copy is provably the document the patient was discharged with."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('wards', '0006_discharge_exit_and_escort'),
    ]

    operations = [
        migrations.AddField(
            model_name='patientadmission',
            name='summary_pdf_file',
            field=models.FileField(
                blank=True,
                null=True,
                upload_to='admission_summaries/',
                help_text='Locked summary PDF generated when discharge completes.',
            ),
        ),
        migrations.AddField(
            model_name='patientadmission',
            name='summary_pdf_generated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
