import re

from django.db import migrations, models


def backfill_admission_instructions(apps, schema_editor):
    PatientAdmission = apps.get_model('wards', 'PatientAdmission')
    pattern = re.compile(r'Instructions:\s*([\s\S]+?)(?:\n\n---|\Z)', re.IGNORECASE)
    for admission in PatientAdmission.objects.exclude(admission_notes=''):
        if admission.admission_instructions:
            continue
        match = pattern.search(admission.admission_notes or '')
        if match:
            admission.admission_instructions = match.group(1).strip()
            admission.save(update_fields=['admission_instructions'])


class Migration(migrations.Migration):

    dependencies = [
        ('wards', '0009_observation_vital_notes_textfield'),
    ]

    operations = [
        migrations.AddField(
            model_name='patientadmission',
            name='admission_instructions',
            field=models.TextField(
                blank=True,
                help_text='Doctor instructions for nursing at admission (observation handoff)',
            ),
        ),
        migrations.RunPython(backfill_admission_instructions, migrations.RunPython.noop),
    ]
