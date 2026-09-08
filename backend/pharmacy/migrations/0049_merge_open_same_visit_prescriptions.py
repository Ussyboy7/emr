from django.db import migrations


def merge_open_same_visit(apps, schema_editor):
    from pharmacy.dispense_lock import merge_open_same_visit_prescriptions

    merge_open_same_visit_prescriptions(dry_run=False)


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0048_merge_pending_same_visit_prescriptions"),
    ]

    operations = [
        migrations.RunPython(merge_open_same_visit, migrations.RunPython.noop),
    ]
