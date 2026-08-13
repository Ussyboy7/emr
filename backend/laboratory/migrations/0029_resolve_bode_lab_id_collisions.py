from django.db import migrations


def resolve_bode_lab_id_collisions(apps, schema_editor):
    LabSampleBatch = apps.get_model("laboratory", "LabSampleBatch")
    LabTest = apps.get_model("laboratory", "LabTest")

    used = set(
        LabTest.objects.filter(lab_number__startswith="BT-")
        .exclude(sample_batch__isnull=False)
        .values_list("lab_number", flat=True)
    )
    used.update(
        LabSampleBatch.objects.filter(accession_number__startswith="BT-")
        .values_list("accession_number", flat=True)
    )

    for batch in LabSampleBatch.objects.filter(accession_number__startswith="BT-").order_by("id"):
        accession = batch.accession_number
        linked_tests = LabTest.objects.filter(sample_batch_id=batch.pk, lab_number=accession)
        has_collision = LabTest.objects.filter(lab_number=accession).exclude(sample_batch_id=batch.pk).exists()
        if not has_collision:
            continue

        parts = accession.split("-")
        try:
            year, serial = parts[-2], int(parts[-1])
        except (IndexError, ValueError):
            continue

        while True:
            serial += 1
            replacement = f"BT-{year}-{serial:04d}"
            if replacement not in used:
                break

        linked_tests.update(lab_number=replacement)
        batch.accession_number = replacement
        batch.save(update_fields=["accession_number"])
        used.add(replacement)


class Migration(migrations.Migration):
    dependencies = [("laboratory", "0028_backfill_bode_thomas_lab_ids")]

    operations = [
        migrations.RunPython(resolve_bode_lab_id_collisions, migrations.RunPython.noop),
    ]
