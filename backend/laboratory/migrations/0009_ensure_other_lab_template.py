# Ensures catalog has a single "Other" template (code OTHER) for tests not in the list;
# clinicians describe the actual test in order clinical notes.

from django.db import migrations


def ensure_other_template(apps, schema_editor):
    LabTemplate = apps.get_model("laboratory", "LabTemplate")
    LabTemplate.objects.get_or_create(
        code="OTHER",
        defaults={
            "name": "Other",
            "category": "chemistry",
            "sample_type": "See clinical notes",
            "description": (
                "Use when the requested test is not in the lab template list. "
                "Describe the exact test name, specimen type, and any instructions "
                "in the order clinical notes so laboratory staff can process it."
            ),
            "normal_range": {
                "Result": {
                    "unit": "",
                    "range": "",
                    "dataType": "text",
                    "required": False,
                }
            },
            "turnaround_time": "Per laboratory",
            "is_active": True,
        },
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0008_laborder_lab_number"),
    ]

    operations = [
        migrations.RunPython(ensure_other_template, noop_reverse),
    ]
