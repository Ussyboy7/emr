# Generated manually — records acknowledgement (physical stamp) tracking.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_acknowledgements(apps, schema_editor):
    Referral = apps.get_model('consultation', 'Referral')
    ResponsibilityFormIssuance = apps.get_model('consultation', 'ResponsibilityFormIssuance')
    for ref in Referral.objects.filter(status='approved_for_forms').exclude(approved_at__isnull=True):
        ts = ref.approved_at
        ResponsibilityFormIssuance.objects.filter(referral_id=ref.id, records_acknowledged_at__isnull=True).update(
            records_acknowledged_at=ts
        )
        if ref.facility_type == 'external' and ref.referral_letter_acknowledged_at is None:
            Referral.objects.filter(pk=ref.pk).update(referral_letter_acknowledged_at=ts)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('consultation', '0012_map_legacy_referral_statuses'),
    ]

    operations = [
        migrations.AddField(
            model_name='referral',
            name='referral_letter_acknowledged_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='referral',
            name='referral_letter_acknowledged_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='referral_letters_acknowledged',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='responsibilityformissuance',
            name='records_acknowledged_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='responsibilityformissuance',
            name='records_acknowledged_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='responsibility_forms_acknowledged',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(backfill_acknowledgements, noop_reverse),
    ]
