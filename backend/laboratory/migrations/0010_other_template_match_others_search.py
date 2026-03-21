# So typing "others" matches via SearchFilter on name.

from django.db import migrations


def update_other_name(apps, schema_editor):
    LabTemplate = apps.get_model("laboratory", "LabTemplate")
    LabTemplate.objects.filter(code="OTHER").update(
        name="Other (Others)",
        description=(
            "Use when the test is not in the catalog (other / others / not listed). "
            "Describe the exact test name, specimen, and instructions in the order clinical notes "
            "for laboratory staff."
        ),
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0009_ensure_other_lab_template"),
    ]

    operations = [
        migrations.RunPython(update_other_name, noop_reverse),
    ]
