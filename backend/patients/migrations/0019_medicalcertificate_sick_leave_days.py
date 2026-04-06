# Generated manually for sick_leave_days on MedicalCertificate.

from django.db import migrations, models


def backfill_sick_leave_days(apps, schema_editor):
    MedicalCertificate = apps.get_model("patients", "MedicalCertificate")
    for cert in MedicalCertificate.objects.filter(purpose="illness").iterator():
        if cert.sick_leave_days is not None:
            continue
        if cert.valid_from and cert.valid_to:
            delta = (cert.valid_to - cert.valid_from).days + 1
            if delta >= 1:
                cert.sick_leave_days = min(delta, 366)
                cert.save(update_fields=["sick_leave_days"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0018_alter_vitalreading_blood_sugar"),
    ]

    operations = [
        migrations.AddField(
            model_name="medicalcertificate",
            name="sick_leave_days",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_sick_leave_days, noop_reverse),
    ]
