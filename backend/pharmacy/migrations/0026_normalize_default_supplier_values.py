from django.db import migrations


def normalize_default_supplier_values(apps, schema_editor):
    MedicationInventory = apps.get_model("pharmacy", "MedicationInventory")

    qs = MedicationInventory.objects.filter(supplier__iexact="Default Supplier").select_related("medication")
    for inv in qs.iterator():
        manufacturer = (getattr(inv.medication, "manufacturer", "") or "").strip()
        inv.supplier = manufacturer
        inv.save(update_fields=["supplier"])


def restore_default_supplier_values(apps, schema_editor):
    MedicationInventory = apps.get_model("pharmacy", "MedicationInventory")
    MedicationInventory.objects.filter(supplier="").update(supplier="Default Supplier")


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0025_backfill_dispensary_receipt_lines"),
    ]

    operations = [
        migrations.RunPython(normalize_default_supplier_values, restore_default_supplier_values),
    ]
