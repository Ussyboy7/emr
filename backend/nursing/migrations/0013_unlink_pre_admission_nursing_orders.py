"""Unlink nursing orders that were attached to an admission before the stay started."""
from django.db import migrations


def unlink_pre_admission_orders(apps, schema_editor):
    PatientAdmission = apps.get_model('wards', 'PatientAdmission')
    NursingOrder = apps.get_model('nursing', 'NursingOrder')

    for admission in PatientAdmission.objects.all().iterator():
        NursingOrder.objects.filter(
            admission_id=admission.id,
            ordered_at__lt=admission.admission_date,
        ).update(admission_id=None)


def relink_post_admission_orphans(apps, schema_editor):
    """Reverse: re-attach same-visit orphans that fall within the stay window."""
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
        ).update(admission_id=admission.id)


class Migration(migrations.Migration):

    dependencies = [
        ('nursing', '0012_backfill_nursing_order_admission'),
    ]

    operations = [
        migrations.RunPython(unlink_pre_admission_orders, relink_post_admission_orphans),
    ]
