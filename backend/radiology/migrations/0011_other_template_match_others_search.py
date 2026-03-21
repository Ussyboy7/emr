# So typing "others" still matches via SearchFilter (icontains on name).

from django.db import migrations


def update_other_name(apps, schema_editor):
    RadiologyTemplate = apps.get_model("radiology", "RadiologyTemplate")
    RadiologyTemplate.objects.filter(code="OTHER").update(
        name="Other (Others)",
        description=(
            "Use when the requested imaging study is not in the template list (other / others / "
            "not listed). Describe the exact examination, body region, modality, and clinical question "
            "in the order clinical notes so radiology staff can schedule and perform the correct study."
        ),
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("radiology", "0010_ensure_other_radiology_template"),
    ]

    operations = [
        migrations.RunPython(update_other_name, noop_reverse),
    ]
