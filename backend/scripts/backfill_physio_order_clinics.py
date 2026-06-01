"""
One-off script: backfill physio orders whose location_clinic was set to
the forwarder's active clinic (or NULL) by re-pointing them to the
patient's visit clinic, which is the canonical "where the physio work lives".

Idempotent: re-running is a no-op once orders match the visit's clinic.

Usage:
  docker exec emr-backend-local python manage.py shell < scripts/backfill_physio_order_clinics.py
"""
from organization.models import SystemConfig
from physiotherapy.models import PhysioOrder


def main() -> None:
    multi_clinic = SystemConfig.is_enabled("multi_clinic_enabled")
    print(f"multi_clinic_enabled = {multi_clinic}")

    qs = PhysioOrder.objects.select_related("visit").all()
    total = qs.count()
    print(f"Total physio orders: {total}")

    fixed = 0
    skipped_match = 0
    skipped_no_visit = 0
    skipped_no_visit_clinic = 0

    for order in qs.iterator():
        if order.visit_id is None or order.visit is None:
            skipped_no_visit += 1
            continue
        visit_clinic_id = order.visit.location_clinic_id
        if visit_clinic_id is None:
            skipped_no_visit_clinic += 1
            continue
        if order.location_clinic_id == visit_clinic_id:
            skipped_match += 1
            continue
        order.location_clinic_id = visit_clinic_id
        order.save(update_fields=["location_clinic"])
        fixed += 1

    print(f"Fixed (location_clinic re-pointed to visit.location_clinic): {fixed}")
    print(f"Already correct: {skipped_match}")
    print(f"No visit attached: {skipped_no_visit}")
    print(f"Visit has no clinic: {skipped_no_visit_clinic}")


main()
