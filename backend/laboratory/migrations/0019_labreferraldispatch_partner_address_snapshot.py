# Generated manually — snapshot partner postal address at dispatch time for PDFs.

from django.db import migrations, models


def backfill_partner_address_snapshot(apps, schema_editor):
    LabReferralDispatch = apps.get_model('laboratory', 'LabReferralDispatch')
    LabPartner = apps.get_model('laboratory', 'LabPartner')
    for dispatch in LabReferralDispatch.objects.exclude(partner_id=None):
        if (dispatch.partner_address_snapshot or '').strip():
            continue
        try:
            partner = LabPartner.objects.get(pk=dispatch.partner_id)
            addr = (partner.address or '').strip()
            if addr:
                dispatch.partner_address_snapshot = partner.address
                dispatch.save(update_fields=['partner_address_snapshot'])
        except LabPartner.DoesNotExist:
            continue


class Migration(migrations.Migration):

    dependencies = [
        ('laboratory', '0018_labpartner_address_contact_title'),
    ]

    operations = [
        migrations.AddField(
            model_name='labreferraldispatch',
            name='partner_address_snapshot',
            field=models.TextField(blank=True),
        ),
        migrations.RunPython(backfill_partner_address_snapshot, migrations.RunPython.noop),
    ]
