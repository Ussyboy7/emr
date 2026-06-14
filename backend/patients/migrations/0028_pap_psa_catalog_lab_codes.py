# Pap smear & PSA lab template mapping + Pap Smear lab template

from django.db import migrations


def ensure_pap_lab_template(apps, schema_editor):
    LabTemplate = apps.get_model("laboratory", "LabTemplate")
    LabTemplate.objects.update_or_create(
        code="PAP-SMEAR",
        defaults={
            "name": "Pap Smear (Cervical Cytology)",
            "category": "cytology",
            "sample_type": "Cervical smear",
            "description": "Cervical cytology screening (Pap smear).",
            "turnaround_time": "3 days",
            "normal_range": {
                "Result": {
                    "unit": "",
                    "range": "Negative / report cytology findings",
                    "dataType": "text",
                    "required": True,
                }
            },
            "sort_order": 0,
            "is_active": True,
        },
    )


def update_pap_psa_catalog(apps, schema_editor):
    Component = apps.get_model("patients", "AnnualCheckupComponentDefinition")
    Component.objects.filter(code="psa").update(lab_template_codes=["PSA"])
    Component.objects.filter(code="pap_smear").update(lab_template_codes=["PAP-SMEAR"])


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0027_annual_checkup_programme_catalog"),
        ("laboratory", "0022_labtemplate_sort_order"),
    ]

    operations = [
        migrations.RunPython(ensure_pap_lab_template, migrations.RunPython.noop),
        migrations.RunPython(update_pap_psa_catalog, migrations.RunPython.noop),
    ]
