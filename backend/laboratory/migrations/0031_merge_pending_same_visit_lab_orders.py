from django.db import migrations


def merge_pending_lab_orders(apps, schema_editor):
    from laboratory.order_merge import merge_pending_same_visit_lab_orders

    merge_pending_same_visit_lab_orders(dry_run=False)


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0030_labtest_lab_tests_status_3eefb5_idx_and_more"),
    ]

    operations = [
        migrations.RunPython(merge_pending_lab_orders, migrations.RunPython.noop),
    ]
