from django.db import migrations


def _resolve_clinic_from_session(session, Clinic):
    if session is None:
        return None
    if getattr(session, "location_clinic_id", None):
        try:
            return Clinic.objects.get(id=session.location_clinic_id)
        except Clinic.DoesNotExist:
            pass
    room = getattr(session, "room", None)
    if room is not None and getattr(room, "clinic_id", None):
        try:
            return Clinic.objects.get(id=room.clinic_id)
        except Clinic.DoesNotExist:
            pass
    visit = getattr(session, "visit", None)
    if visit is not None and getattr(visit, "location_clinic_id", None):
        try:
            return Clinic.objects.get(id=visit.location_clinic_id)
        except Clinic.DoesNotExist:
            pass
    return None


def backfill_eye_order_location_clinic(apps, schema_editor):
    EyeOrder = apps.get_model("eyecare", "EyeOrder")
    Clinic = apps.get_model("organization", "Clinic")
    qs = (
        EyeOrder.objects.filter(location_clinic__isnull=True)
        .select_related(
            "consultation_session",
            "consultation_session__visit",
            "consultation_session__room",
            "visit",
        )
        .iterator(chunk_size=200)
    )
    for order in qs:
        clinic = None
        if order.consultation_session_id:
            clinic = _resolve_clinic_from_session(order.consultation_session, Clinic)
        if clinic is None and order.visit_id:
            visit = order.visit
            if visit is not None and getattr(visit, "location_clinic_id", None):
                try:
                    clinic = Clinic.objects.get(id=visit.location_clinic_id)
                except Clinic.DoesNotExist:
                    pass
        if clinic is not None:
            order.location_clinic = clinic
            order.save(update_fields=["location_clinic"])


class Migration(migrations.Migration):

    dependencies = [
        ("eyecare", "0007_eyeorder_location_clinic"),
        ("organization", "0006_backfill_multi_clinic"),
    ]

    operations = [
        migrations.RunPython(
            backfill_eye_order_location_clinic,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
