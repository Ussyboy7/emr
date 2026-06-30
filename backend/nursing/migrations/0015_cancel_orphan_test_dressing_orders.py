"""Cancel orphaned consultation test dressing orders cluttering the procedures queue."""
from django.db import migrations


def cancel_test_dressing_orders(apps, schema_editor):
    NursingOrder = apps.get_model('nursing', 'NursingOrder')
    (
        NursingOrder.objects.filter(
            order_type__iexact='dressing',
            status='pending',
            admission_id__isnull=True,
            description__icontains='test',
        ).update(status='cancelled')
    )


class Migration(migrations.Migration):

    dependencies = [
        ('nursing', '0014_nursingorder_admission_patient_integrity'),
    ]

    operations = [
        migrations.RunPython(cancel_test_dressing_orders, migrations.RunPython.noop),
    ]
