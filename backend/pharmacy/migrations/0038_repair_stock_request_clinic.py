from django.db import migrations


def _multi_clinic_enabled(SystemConfig):
    try:
        entry = SystemConfig.objects.get(key="multi_clinic_enabled")
    except SystemConfig.DoesNotExist:
        return False
    return entry.value in ("true", "True", "1", "yes", "Yes")


def _resolve_clinic_id(user, multi_clinic_enabled):
    if multi_clinic_enabled:
        clinic_id = user.active_clinic_id or user.clinic_id
    else:
        clinic_id = user.clinic_id
    if clinic_id:
        return clinic_id
    through = user.clinics.through
    return (
        through.objects.filter(user_id=user.id)
        .order_by("clinic_id")
        .values_list("clinic_id", flat=True)
        .first()
    )


def repair_stock_request_clinics(apps, schema_editor):
    StockRequest = apps.get_model("pharmacy", "StockRequest")
    SystemConfig = apps.get_model("organization", "SystemConfig")
    multi = _multi_clinic_enabled(SystemConfig)

    qs = (
        StockRequest.objects.filter(clinic__isnull=True, requested_by__isnull=False)
        .select_related("requested_by")
        .prefetch_related("requested_by__clinics")
    )
    for request in qs.iterator(chunk_size=500):
        clinic_id = _resolve_clinic_id(request.requested_by, multi)
        if clinic_id:
            StockRequest.objects.filter(pk=request.pk).update(clinic_id=clinic_id)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0037_backfill_stock_request_clinic"),
    ]

    operations = [
        migrations.RunPython(repair_stock_request_clinics, noop),
    ]
