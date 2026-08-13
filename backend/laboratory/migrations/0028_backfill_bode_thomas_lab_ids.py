from django.db import migrations


def backfill_bode_thomas_lab_ids(apps, schema_editor):
    LabSampleBatch = apps.get_model("laboratory", "LabSampleBatch")
    LabTest = apps.get_model("laboratory", "LabTest")

    for batch in LabSampleBatch.objects.filter(accession_number__startswith="BODE-THOMAS-"):
        old_accession = batch.accession_number
        new_accession = old_accession.replace("BODE-THOMAS-", "BT-", 1)

        if LabSampleBatch.objects.filter(accession_number=new_accession).exclude(pk=batch.pk).exists():
            raise RuntimeError(f"Cannot backfill {old_accession}: {new_accession} already exists")

        LabTest.objects.filter(sample_batch_id=batch.pk, lab_number=old_accession).update(
            lab_number=new_accession,
        )
        batch.accession_number = new_accession
        batch.save(update_fields=["accession_number"])


class Migration(migrations.Migration):
    dependencies = [("laboratory", "0027_lab_routing_event_constraints")]

    operations = [
        migrations.RunPython(backfill_bode_thomas_lab_ids, migrations.RunPython.noop),
    ]
