"""Backfill admission FK on visit-scoped nursing orders."""
from django.db import migrations


def backfill_nursing_order_admissions(apps, schema_editor):
    PatientAdmission = apps.get_model('wards', 'PatientAdmission')
    NursingOrder = apps.get_model('nursing', 'NursingOrder')

    for admission in PatientAdmission.objects.all().iterator():
        NursingOrder.objects.filter(
            patient_id=admission.patient_id,
            visit_id=admission.visit_id,
            admission__isnull=True,
            ordered_at__gte=admission.admission_date,
        ).exclude(
            order_type__iexact='observation admission',
        ).exclude(
            order_type__iexact='ward admission',
        ).exclude(
            is_informational=True,
        ).update(admission_id=admission.id)


class Migration(migrations.Migration):

    dependencies = [
        ('nursing', '0011_nursingorder_is_informational'),
        ('wards', '0011_backfill_admitting_doctor'),
    ]

    operations = [
        migrations.RunPython(backfill_nursing_order_admissions, migrations.RunPython.noop),
    ]
