from django.db import migrations


def _multi_clinic_enabled(SystemConfig):
    try:
        entry = SystemConfig.objects.get(key="multi_clinic_enabled")
    except SystemConfig.DoesNotExist:
        return False
    return entry.value in ("true", "True", "1", "yes", "Yes")


def _resolve_clinic_id(user, multi_clinic_enabled):
    if multi_clinic_enabled:
        return user.active_clinic_id or user.clinic_id
    return user.clinic_id


def backfill_stock_request_clinic(apps, schema_editor):
    StockRequest = apps.get_model("pharmacy", "StockRequest")
    SystemConfig = apps.get_model("organization", "SystemConfig")
    multi = _multi_clinic_enabled(SystemConfig)

    qs = (
        StockRequest.objects.filter(clinic__isnull=True, requested_by__isnull=False)
        .select_related("requested_by")
        .only("id", "requested_by_id", "requested_by__clinic_id", "requested_by__active_clinic_id")
    )
    for request in qs.iterator(chunk_size=500):
        clinic_id = _resolve_clinic_id(request.requested_by, multi)
        if clinic_id:
            StockRequest.objects.filter(pk=request.pk).update(clinic_id=clinic_id)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0036_rename_hod_stock_i_issue_i_6f0f0d_idx_hod_stock_i_issue_i_6c4728_idx_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_stock_request_clinic, noop),
    ]
