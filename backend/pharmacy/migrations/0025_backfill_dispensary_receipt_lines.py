# Backfill DispensaryReceiptLine from existing MedicationInventory (location=Dispensary)
from django.db import migrations
from django.utils import timezone


def backfill_receipt_lines(apps, schema_editor):
    MedicationInventory = apps.get_model('pharmacy', 'MedicationInventory')
    DispensaryReceiptLine = apps.get_model('pharmacy', 'DispensaryReceiptLine')
    dispensary_inv = MedicationInventory.objects.filter(
        location__icontains='dispensary',
        quantity__gt=0,
    ).select_related('medication')
    for inv in dispensary_inv:
        received_at = inv.created_at or timezone.now()
        DispensaryReceiptLine.objects.create(
            medication=inv.medication,
            quantity=inv.quantity,
            quantity_remaining=inv.quantity,
            received_at=received_at,
            batch_number=inv.batch_number or '',
            expiry_date=inv.expiry_date,
            request=None,
            issue=None,
            stock_issue_line=None,
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('pharmacy', '0024_dispense_dispensary_receipt_line'),
    ]

    operations = [
        migrations.RunPython(backfill_receipt_lines, noop),
    ]
