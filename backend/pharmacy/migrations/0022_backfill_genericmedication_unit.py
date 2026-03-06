# Backfill GenericMedication.unit from dosage_form for existing rows

def infer_unit(dosage_form):
    f = (dosage_form or "").strip().lower()
    if not f:
        return "tablet"
    if any(k in f for k in ["tablet", "caplet", "chewable"]):
        return "tablet"
    if any(k in f for k in ["capsule", "softgel"]):
        return "capsule"
    if any(k in f for k in ["syrup", "suspension", "solution", "oral liquid"]):
        return "bottle"
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
    return f or "tablet"


def backfill_units(apps, schema_editor):
    GenericMedication = apps.get_model("pharmacy", "GenericMedication")
    updated = 0
    for g in GenericMedication.objects.filter(unit__in=("", None)):
        g.unit = infer_unit(g.dosage_form)
        g.save(update_fields=["unit"])
        updated += 1


def noop(apps, schema_editor):
    pass


from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0021_genericmedication_unit"),
    ]

    operations = [
        migrations.RunPython(backfill_units, noop),
    ]
