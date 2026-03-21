# Ensures catalog has "Other" (code OTHER); clinicians describe the study in order clinical notes.

from django.db import migrations


def ensure_other_radiology_template(apps, schema_editor):
    RadiologyTemplate = apps.get_model("radiology", "RadiologyTemplate")
    RadiologyTemplate.objects.get_or_create(
        code="OTHER",
        defaults={
            "name": "Other",
            "category": "xray",
            "subcategory": "",
            "description": (
                "Use when the requested imaging study is not in the template list. "
                "Describe the exact examination, body region, modality, and clinical question "
                "in the order clinical notes so radiology staff can schedule and perform the correct study."
            ),
            "body_part": "See clinical notes",
            "modality": "See clinical notes",
            "radiation_exposure": "moderate",
            "preparation_required": "",
            "indications": "",
            "contraindications": "",
            "turnaround_time": "Per radiology",
            "report_template": {},
            "is_active": True,
        },
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("radiology", "0009_merge_findings_impression_into_report"),
    ]

    operations = [
        migrations.RunPython(ensure_other_radiology_template, noop_reverse),
    ]
