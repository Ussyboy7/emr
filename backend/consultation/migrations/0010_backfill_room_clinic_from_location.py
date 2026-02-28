# Generated manually - Backfill ConsultationRoom.clinic from location when it matches Clinic.name

from django.db import migrations


def backfill_room_clinic(apps, schema_editor):
    """Set clinic FK from location string when it matches a Clinic name."""
    ConsultationRoom = apps.get_model('consultation', 'ConsultationRoom')
    Clinic = apps.get_model('organization', 'Clinic')

    clinics_by_name = {c.name: c for c in Clinic.objects.filter(is_active=True)}

    for room in ConsultationRoom.objects.filter(clinic__isnull=True).exclude(location__isnull=True).exclude(location=''):
        clinic = clinics_by_name.get(room.location.strip())
        if clinic:
            room.clinic = clinic
            room.save(update_fields=['clinic'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('organization', '0001_initial'),
        ('consultation', '0009_remove_consultationqueue_consult_q_active_queued_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_room_clinic, noop),
    ]
