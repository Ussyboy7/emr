from django.db import migrations


def backfill_stock_request_clinic(apps, schema_editor):
    StockRequest = apps.get_model("pharmacy", "StockRequest")
    for request in (
        StockRequest.objects.filter(clinic__isnull=True, requested_by__clinic__isnull=False)
        .select_related("requested_by")
        .iterator(chunk_size=500)
    ):
        StockRequest.objects.filter(pk=request.pk).update(clinic_id=request.requested_by.clinic_id)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0036_rename_hod_stock_i_issue_i_6f0f0d_idx_hod_stock_i_issue_i_6c4728_idx_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_stock_request_clinic, noop),
    ]
