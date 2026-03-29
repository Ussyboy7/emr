# Legacy rows (e.g. status mapped from "sent" without setting submitted_at) broke Records UI gating.

from django.db import migrations
from django.db.models import F


def backfill_submitted_at(apps, schema_editor):
    Referral = apps.get_model('consultation', 'Referral')
    Referral.objects.filter(
        submitted_at__isnull=True,
        status__in=[
            'submitted_to_records',
            'records_review',
            'returned_for_correction',
            'approved_for_forms',
            'closed',
        ],
    ).update(submitted_at=F('referred_at'))


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('consultation', '0013_referral_and_form_acknowledgement'),
    ]

    operations = [
        migrations.RunPython(backfill_submitted_at, noop_reverse),
    ]
