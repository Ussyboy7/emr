from django.db import migrations


def map_legacy_statuses(apps, schema_editor):
    Referral = apps.get_model('consultation', 'Referral')

    # Legacy -> new workflow statuses
    Referral.objects.filter(status='sent').update(status='submitted_to_records')
    Referral.objects.filter(status='accepted').update(status='records_review')
    Referral.objects.filter(status='scheduled').update(status='approved_for_forms')
    Referral.objects.filter(status='completed').update(status='closed')


def reverse_map_legacy_statuses(apps, schema_editor):
    Referral = apps.get_model('consultation', 'Referral')

    # Best-effort reverse mapping
    Referral.objects.filter(status='submitted_to_records').update(status='sent')
    Referral.objects.filter(status='records_review').update(status='accepted')
    Referral.objects.filter(status='approved_for_forms').update(status='scheduled')
    Referral.objects.filter(status='closed').update(status='completed')


class Migration(migrations.Migration):

    dependencies = [
        ('consultation', '0011_remove_referral_accepted_at_and_more'),
    ]

    operations = [
        migrations.RunPython(map_legacy_statuses, reverse_map_legacy_statuses),
    ]

