"""Clear nursing-order admission links that do not match the admission patient."""
from django.db import migrations


def unlink_mismatched_admission_patients(apps, schema_editor):
    NursingOrder = apps.get_model('nursing', 'NursingOrder')
    PatientAdmission = apps.get_model('wards', 'PatientAdmission')

    for order in (
        NursingOrder.objects.filter(admission_id__isnull=False)
        .select_related('admission')
        .iterator()
    ):
        admission = order.admission
        if admission and order.patient_id != admission.patient_id:
            order.admission_id = None
            order.save(update_fields=['admission_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('nursing', '0013_unlink_pre_admission_nursing_orders'),
    ]

    operations = [
        migrations.RunPython(unlink_mismatched_admission_patients, migrations.RunPython.noop),
    ]
