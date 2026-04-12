# Backfill Visit.clinic, clinics, and completed_clinics using normalize_clinic_name
# so stored values match active OutpatientClinicType names (e.g. GOPD, Eye Clinic).

from django.db import migrations


def forwards(apps, schema_editor):
    Visit = apps.get_model("patients", "Visit")
    from common.clinic_utils import normalize_clinic_name

    for v in Visit.objects.iterator(chunk_size=500):
        new_primary = (
            normalize_clinic_name(str(v.clinic).strip())
            if v.clinic and str(v.clinic).strip()
            else ""
        )
        new_clinics = list(
            dict.fromkeys(
                normalize_clinic_name(str(c).strip())
                for c in (v.clinics or [])
                if c is not None and str(c).strip()
            )
        )
        new_done = list(
            dict.fromkeys(
                normalize_clinic_name(str(c).strip())
                for c in (v.completed_clinics or [])
                if c is not None and str(c).strip()
            )
        )
        if new_primary and new_primary not in new_clinics:
            if not new_clinics:
                new_clinics = [new_primary]
            else:
                new_clinics = [*new_clinics, new_primary]
            new_clinics = list(dict.fromkeys(new_clinics))

        if (
            new_primary != (v.clinic or "")
            or new_clinics != (v.clinics or [])
            or new_done != (v.completed_clinics or [])
        ):
            Visit.objects.filter(pk=v.pk).update(
                clinic=new_primary,
                clinics=new_clinics,
                completed_clinics=new_done,
            )


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0019_medicalcertificate_sick_leave_days"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
