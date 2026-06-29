from django.db import migrations


def repair_duplicate_generic_lines(apps, schema_editor):
    from pharmacy.prescription_lines import repair_all_redundant_generic_siblings

    repair_all_redundant_generic_siblings()


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0040_backfill_dispensary_receipt_location_clinic"),
    ]

    operations = [
        migrations.RunPython(repair_duplicate_generic_lines, migrations.RunPython.noop),
    ]
