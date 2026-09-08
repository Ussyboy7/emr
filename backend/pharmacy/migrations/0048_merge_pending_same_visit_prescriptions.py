from django.db import migrations


def merge_pending_same_visit(apps, schema_editor):
    """Historical cleanup: one pending RX per patient+visit where possible."""
    from pharmacy.dispense_lock import merge_pending_same_visit_prescriptions

    merge_pending_same_visit_prescriptions(dry_run=False)


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0047_prescription_dispense_lock"),
    ]

    operations = [
        migrations.RunPython(merge_pending_same_visit, migrations.RunPython.noop),
    ]
