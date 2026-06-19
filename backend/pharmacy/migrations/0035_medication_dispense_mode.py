from django.db import migrations, models

from pharmacy.dispense_units import infer_dispense_mode


def backfill_dispense_modes(apps, schema_editor):
    Medication = apps.get_model("pharmacy", "Medication")
    for med in Medication.objects.all().iterator():
        med.dispense_mode = infer_dispense_mode(med.unit or "", med.form or "")
        med.save(update_fields=["dispense_mode"])


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0034_hod_stock_issue"),
    ]

    operations = [
        migrations.AddField(
            model_name="medication",
            name="dispense_mode",
            field=models.CharField(
                choices=[
                    ("pack_only", "Whole packs only"),
                    ("units_only", "Individual units only"),
                    ("pack_or_units", "Pack or units (choose at issue)"),
                ],
                default="pack_or_units",
                help_text="Whether staff issue whole packs, individual units, or may choose.",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="hodstockissue",
            name="quantity_entry_mode",
            field=models.CharField(
                blank=True,
                choices=[("pack", "Pack"), ("units", "Units")],
                default="",
                help_text="How quantity was entered at issue time (pack vs individual units).",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="dispense",
            name="quantity_entry_mode",
            field=models.CharField(
                blank=True,
                choices=[("pack", "Pack"), ("units", "Units")],
                default="",
                help_text="How quantity was entered at dispense time (pack vs individual units).",
                max_length=10,
            ),
        ),
        migrations.RunPython(backfill_dispense_modes, migrations.RunPython.noop),
    ]
