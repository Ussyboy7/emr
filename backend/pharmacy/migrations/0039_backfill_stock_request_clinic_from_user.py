from django.db import migrations


def backfill_from_requester_home_clinic(apps, schema_editor):
    StockRequest = apps.get_model("pharmacy", "StockRequest")
    for request in (
        StockRequest.objects.filter(clinic__isnull=True, requested_by__clinic__isnull=False)
        .select_related("requested_by")
        .iterator(chunk_size=500)
    ):
        StockRequest.objects.filter(pk=request.pk).update(clinic_id=request.requested_by.clinic_id)


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0037_backfill_stock_request_clinic"),
    ]

    operations = [
        migrations.RunPython(backfill_from_requester_home_clinic, migrations.RunPython.noop),
    ]
