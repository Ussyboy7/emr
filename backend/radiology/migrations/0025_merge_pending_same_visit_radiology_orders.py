from django.db import migrations


def merge_pending_radiology_orders(apps, schema_editor):
    from radiology.order_merge import merge_pending_same_visit_radiology_orders

    merge_pending_same_visit_radiology_orders(dry_run=False)


class Migration(migrations.Migration):

    dependencies = [
        ("radiology", "0024_radiologystudy_radiology_s_status_96c0e5_idx_and_more"),
    ]

    operations = [
        migrations.RunPython(merge_pending_radiology_orders, migrations.RunPython.noop),
    ]
