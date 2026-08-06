from django.db import migrations


def backfill_dispensary_receipt_location_clinic(apps, schema_editor):
    StockRequest = apps.get_model("pharmacy", "StockRequest")
    DispensaryReceiptLine = apps.get_model("pharmacy", "DispensaryReceiptLine")
    Clinic = apps.get_model("organization", "Clinic")

    for req in (
        StockRequest.objects.filter(requested_by__location_clinic__isnull=False)
        .select_related("requested_by")
        .iterator(chunk_size=500)
    ):
        home_clinic_id = req.requested_by.location_clinic_id
        if home_clinic_id and req.clinic_id != home_clinic_id:
            StockRequest.objects.filter(pk=req.pk).update(clinic_id=home_clinic_id)

    central_clinic_id = (
        Clinic.objects.filter(code="BODE-THOMAS").values_list("id", flat=True).first()
    )

    for line in (
        DispensaryReceiptLine.objects.filter(location_clinic__isnull=True)
        .select_related("request")
        .iterator(chunk_size=500)
    ):
        clinic_id = None
        if line.request_id and line.request.clinic_id:
            clinic_id = line.request.clinic_id
        elif central_clinic_id is not None:
            clinic_id = central_clinic_id
        if clinic_id is not None:
            DispensaryReceiptLine.objects.filter(pk=line.pk).update(location_clinic_id=clinic_id)

    for line in (
        DispensaryReceiptLine.objects.filter(
            request__isnull=False,
            request__clinic__isnull=False,
        )
        .select_related("request")
        .iterator(chunk_size=500)
    ):
        if line.location_clinic_id != line.request.clinic_id:
            DispensaryReceiptLine.objects.filter(pk=line.pk).update(
                location_clinic_id=line.request.clinic_id
            )


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0039_backfill_stock_request_clinic_from_user"),
        ("accounts", "0010_remove_user_users_clinic__d0f33b_idx_and_more"),
    ]

    operations = [
        migrations.RunPython(
            backfill_dispensary_receipt_location_clinic,
            migrations.RunPython.noop,
        ),
    ]
