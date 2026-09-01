"""
Backfill location_clinic on physio orders that predate the multi-clinic
migration.  For each order with location_clinic=NULL, resolve the clinic
from the linked visit → consultation_session → ordered_by user's home
facility and update it.

This is a data-only migration; it does not alter the schema.
"""

from django.db import migrations


def forwards(apps, schema_editor):
    PhysioOrder = apps.get_model("physiotherapy", "PhysioOrder")
    Visit = apps.get_model("patients", "Visit")
    ConsultationSession = apps.get_model("consultation", "ConsultationSession")
    User = apps.get_model("accounts", "User")
    db_alias = schema_editor.connection.alias

    # Grab all orders that still lack a location_clinic.
    orphan_ids = list(
        PhysioOrder.objects.using(db_alias)
        .filter(location_clinic__isnull=True)
        .values_list("pk", flat=True)
    )
    if not orphan_ids:
        return

    orders = PhysioOrder.objects.using(db_alias).filter(pk__in=orphan_ids)

    # Pre-fetch related data to avoid N+1.
    visit_map = {}
    for v in Visit.objects.using(db_alias).filter(
        pk__in=orders.values_list("visit_id", flat=True)
    ).exclude(location_clinic__isnull=True):
        visit_map[v.pk] = v.location_clinic_id

    session_map = {}
    for cs in ConsultationSession.objects.using(db_alias).filter(
        pk__in=orders.values_list("consultation_session_id", flat=True)
    ).exclude(location_clinic__isnull=True):
        session_map[cs.pk] = cs.location_clinic_id

    user_map = {}
    for u in User.objects.using(db_alias).filter(
        pk__in=orders.values_list("ordered_by_id", flat=True)
    ).exclude(location_clinic__isnull=True):
        user_map[u.pk] = u.location_clinic_id

    batch = []
    for order in orders:
        clinic = None
        if order.visit_id:
            clinic = visit_map.get(order.visit_id)
        if clinic is None and order.consultation_session_id:
            clinic = session_map.get(order.consultation_session_id)
        if clinic is None and order.ordered_by_id:
            clinic = user_map.get(order.ordered_by_id)
        if clinic is not None:
            batch.append((order.pk, clinic))

    if batch:
        order_clinic_map = dict(batch)
        orders_to_update = PhysioOrder.objects.using(db_alias).filter(
            pk__in=order_clinic_map.keys(),
        )
        for order in orders_to_update:
            order.location_clinic_id = order_clinic_map[order.pk]
        PhysioOrder.objects.using(db_alias).bulk_update(
            orders_to_update, ["location_clinic_id"], batch_size=500,
        )


def backwards(apps, schema_editor):
    """No-op: we don't want to un-set location_clinic on rollback."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("physiotherapy", "0016_physioorder_admission"),
        ("organization", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
