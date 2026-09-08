from django.db import migrations
from django.db.models import Q


def backfill_store_inventory_location_clinic(apps, schema_editor):
    """
    Assign Bode Thomas to Central Store / HOD Store inventory rows that lack
    (or have the wrong) location_clinic so stock summaries match View Batches.
    """
    MedicationInventory = apps.get_model("pharmacy", "MedicationInventory")
    Clinic = apps.get_model("organization", "Clinic")

    central_clinic_id = (
        Clinic.objects.filter(code="BODE-THOMAS").values_list("id", flat=True).first()
    )
    if central_clinic_id is None:
        return

    warehouse_locations = Q(location__iexact="Store") | Q(location__iexact="HOD Store")
    MedicationInventory.objects.filter(warehouse_locations).filter(
        Q(location_clinic__isnull=True) | ~Q(location_clinic_id=central_clinic_id)
    ).update(location_clinic_id=central_clinic_id)


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0045_prescription_admission"),
    ]

    operations = [
        migrations.RunPython(
            backfill_store_inventory_location_clinic,
            migrations.RunPython.noop,
        ),
    ]
