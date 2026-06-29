# Backfill GenericMedication.unit and fix prescription lines where tablet was stored for capsule/softgel forms.

from django.db import migrations


def infer_dose_unit(dosage_form):
    f = (dosage_form or "").strip().lower()
    if not f:
        return "tablet"
    if any(k in f for k in ["tablet", "caplet", "chewable"]):
        return "tablet"
    if any(k in f for k in ["capsule", "softgel"]):
        return "capsule"
    if any(k in f for k in ["syrup", "suspension", "solution", "oral liquid"]):
        return "ml"
    if any(k in f for k in ["injection", "vial", "ampoule"]):
        return "vial"
    if any(k in f for k in ["inhaler", "puff"]):
        return "puff"
    if any(k in f for k in ["cream", "ointment", "gel", "lotion"]):
        return "tube"
    if any(k in f for k in ["drop", "eye", "ear", "otic"]):
        return "drop"
    if "sachet" in f:
        return "sachet"
    if "suppository" in f:
        return "suppository"
    if "patch" in f:
        return "patch"
    if "bottle" in f:
        return "bottle"
    return f


def forwards(apps, schema_editor):
    GenericMedication = apps.get_model("pharmacy", "GenericMedication")
    PrescriptionItem = apps.get_model("pharmacy", "PrescriptionItem")

    for generic in GenericMedication.objects.all().iterator():
        inferred = infer_dose_unit(generic.dosage_form)
        current = (generic.unit or "").strip().lower()
        if not current:
            generic.unit = inferred
            generic.save(update_fields=["unit"])
        elif current == "tablet" and inferred == "capsule":
            generic.unit = "capsule"
            generic.save(update_fields=["unit"])

    for item in PrescriptionItem.objects.select_related("generic").iterator():
        form = (item.dosage_form or getattr(item.generic, "dosage_form", "") or "").strip()
        inferred = infer_dose_unit(form)
        current = (item.unit or "").strip().lower()
        if not current:
            item.unit = inferred
            item.save(update_fields=["unit"])
        elif current == "tablet" and inferred == "capsule":
            item.unit = "capsule"
            item.save(update_fields=["unit"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0041_supersede_duplicate_generic_rx_lines"),
    ]

    operations = [
        migrations.RunPython(forwards, noop),
    ]
