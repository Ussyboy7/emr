# Generated manually - Backfill location_clinic for Patient and Visit from location string

from django.db import migrations


def backfill_location_clinic(apps, schema_editor):
    """Set location_clinic from location string when it matches a Clinic name."""
    Patient = apps.get_model('patients', 'Patient')
    Visit = apps.get_model('patients', 'Visit')
    Clinic = apps.get_model('organization', 'Clinic')

    # Build lookup: clinic name -> clinic
    clinics_by_name = {c.name: c for c in Clinic.objects.filter(is_active=True)}

    for patient in Patient.objects.filter(location_clinic__isnull=True).exclude(location__isnull=True).exclude(location=''):
        clinic = clinics_by_name.get(patient.location.strip())
        if clinic:
            patient.location_clinic = clinic
            patient.save(update_fields=['location_clinic'])

    for visit in Visit.objects.filter(location_clinic__isnull=True).exclude(location__isnull=True).exclude(location=''):
        clinic = clinics_by_name.get(visit.location.strip())
        if clinic:
            visit.location_clinic = clinic
            visit.save(update_fields=['location_clinic'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('organization', '0001_initial'),
        ('patients', '0013_add_location_clinic_fk'),
    ]

    operations = [
        migrations.RunPython(backfill_location_clinic, noop),
    ]
