# Generated manually — normalize legacy visit-type priorities and align field default.

from django.db import migrations, models


def _priority_for_visit_type(visit_type):
    return 0 if visit_type == 'emergency' else 1


def normalize_consultation_queue_priorities(apps, schema_editor):
    ConsultationQueue = apps.get_model('consultation', 'ConsultationQueue')
    Visit = apps.get_model('patients', 'Visit')

    visit_types = {
        vid: vtype
        for vid, vtype in Visit.objects.values_list('id', 'visit_type')
    }

    to_update = []
    for row in ConsultationQueue.objects.only('id', 'visit_id', 'priority').iterator():
        visit_type = visit_types.get(row.visit_id) if row.visit_id else None
        new_priority = _priority_for_visit_type(visit_type)
        if row.priority != new_priority:
            row.priority = new_priority
            to_update.append(row)

    if to_update:
        ConsultationQueue.objects.bulk_update(to_update, ['priority'], batch_size=500)


def noop_reverse(apps, schema_editor):
    """Legacy 1/2/3 tiers cannot be reconstructed reliably."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('consultation', '0025_fix_room_unique_per_clinic'),
    ]

    operations = [
        migrations.AlterField(
            model_name='consultationqueue',
            name='priority',
            field=models.IntegerField(
                default=1,
                help_text='0 = emergency (jumps queue); 1 = normal tier (FIFO by queued_at).',
            ),
        ),
        migrations.RunPython(
            normalize_consultation_queue_priorities,
            noop_reverse,
        ),
    ]
