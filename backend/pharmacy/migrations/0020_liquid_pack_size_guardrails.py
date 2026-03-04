from django.db import migrations


def backfill_liquid_bottle_pack_sizes(apps, schema_editor):
    Medication = apps.get_model('pharmacy', 'Medication')
    Medication.objects.filter(
        unit__iregex=r'^(bottle|bottles)$',
        form__iregex=r'^(syrup|suspension|solution)$',
        pack_size__isnull=True,
    ).update(pack_size=100)
    Medication.objects.filter(
        unit__iregex=r'^(bottle|bottles)$',
        form__iregex=r'^(syrup|suspension|solution)$',
        pack_size__lte=0,
    ).update(pack_size=100)


class Migration(migrations.Migration):

    dependencies = [
        ('pharmacy', '0019_rename_prescriptionitem_dosage_to_dose'),
    ]

    operations = [
        migrations.RunPython(backfill_liquid_bottle_pack_sizes, migrations.RunPython.noop),
        migrations.RunSQL(
            sql="""
                ALTER TABLE medications
                ADD CONSTRAINT medications_liquid_bottle_pack_size_chk
                CHECK (
                    NOT (
                        lower(unit) IN ('bottle', 'bottles')
                        AND lower(form) IN ('syrup', 'suspension', 'solution')
                        AND (pack_size IS NULL OR pack_size <= 0)
                    )
                );
            """,
            reverse_sql="""
                ALTER TABLE medications
                DROP CONSTRAINT IF EXISTS medications_liquid_bottle_pack_size_chk;
            """,
        ),
    ]
