# Rename OTHER template modality/body_part and backfill existing studies.

from django.db import migrations

OTHER_MODALITY_LABEL = "Other (see clinical notes)"


def apply_label(apps, schema_editor):
    RadiologyTemplate = apps.get_model("radiology", "RadiologyTemplate")
    RadiologyStudy = apps.get_model("radiology", "RadiologyStudy")
    RadiologyTemplate.objects.filter(code="OTHER").update(
        modality=OTHER_MODALITY_LABEL,
        body_part=OTHER_MODALITY_LABEL,
    )
    RadiologyStudy.objects.filter(modality__iexact="See clinical notes").update(
        modality=OTHER_MODALITY_LABEL
    )


def revert_label(apps, schema_editor):
    RadiologyTemplate = apps.get_model("radiology", "RadiologyTemplate")
    RadiologyStudy = apps.get_model("radiology", "RadiologyStudy")
    RadiologyTemplate.objects.filter(code="OTHER").update(
        modality="See clinical notes",
        body_part="See clinical notes",
    )
    RadiologyStudy.objects.filter(modality=OTHER_MODALITY_LABEL).update(
        modality="See clinical notes"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("radiology", "0019_radiologyorder_location_clinic_and_more"),
    ]

    operations = [
        migrations.RunPython(apply_label, revert_label),
    ]
