# Renal function, liver function, abdominal scan — annual check-up catalog

from django.db import migrations

from patients.annual_checkup_catalog import SEED_COMPONENTS


NEW_CODES = ("lab_renal", "lab_liver", "abdominal_scan")


def add_catalog_components(apps, schema_editor):
    Component = apps.get_model("patients", "AnnualCheckupComponentDefinition")
    Programme = apps.get_model("patients", "AnnualCheckupProgrammeSettings")

    seed_by_code = {row["code"]: row for row in SEED_COMPONENTS}
    for code in NEW_CODES:
        row = seed_by_code.get(code)
        if row:
            Component.objects.update_or_create(code=code, defaults=row)

    for programme in Programme.objects.all():
        selected = list(programme.default_selected_codes or [])
        changed = False
        for code in NEW_CODES:
            if code not in selected:
                selected.append(code)
                changed = True
        if changed:
            programme.default_selected_codes = selected
            programme.save(update_fields=["default_selected_codes", "updated_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0028_pap_psa_catalog_lab_codes"),
    ]

    operations = [
        migrations.RunPython(add_catalog_components, migrations.RunPython.noop),
    ]
